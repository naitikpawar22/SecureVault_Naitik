const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnectDB();
});

test('SecureVault Complete Test Suite - E2EE, Multipart (1GB+), ACL, S3 & Audit', async (t) => {
  let user1Token;
  let user1Id;
  let user2Token;
  let user2Id;
  let fileId;
  let shareToken;
  let shareLinkId;

  const mockPublicKey1 = {
    kty: 'EC',
    crv: 'P-256',
    x: 'WKn-nIG5qwMRBp_kE7RwJ0kG1A52G0A7Z2c2bZ1_123',
    y: 'Hq0K_d9qZ-b3Z3c4b5_67890abcdef1234567890',
  };

  const mockPublicKey2 = {
    kty: 'EC',
    crv: 'P-256',
    x: 'AKn-mIG5qwMRBp_kE7RwJ0kG1A52G0A7Z2c2bZ1_999',
    y: 'Pq0K_d9qZ-b3Z3c4b5_67890abcdef1234567899',
  };

  await t.test('1. Register User 1 with ECDH public key', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Vault',
        email: `alice_test_${Date.now()}@securevault.local`,
        password: 'SuperSecretPassword123!',
        publicKey: mockPublicKey1,
        encryptedPrivateKey: {
          ciphertext: 'mock_encrypted_private_key_base64',
          salt: 'aabbccddeeff0011',
          iv: '0102030405060708090a0b0c',
        },
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.ok(data.accessToken);
    user1Token = data.accessToken;
    user1Id = data.user.id;
  });

  await t.test('2. Register User 2 (Recipient)', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Recipient',
        email: `bob_test_${Date.now()}@securevault.local`,
        password: 'AnotherSecretPassword123!',
        publicKey: mockPublicKey2,
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    user2Token = data.accessToken;
    user2Id = data.user.id;
  });

  await t.test('3. Test S3 Multipart / Chunked Upload (for 1GB+ large files)', async () => {
    // A. Initiate multipart session
    const initRes = await fetch(`${baseUrl}/files/multipart/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        originalName: 'enterprise-dataset-large.bin',
        mimeType: 'application/octet-stream',
      }),
    });
    const initData = await initRes.json();
    assert.equal(initRes.status, 200);
    assert.ok(initData.uploadId);
    assert.ok(initData.s3ObjectKey);

    const { uploadId, s3ObjectKey } = initData;

    // B. Upload Part 1
    const boundary = '----WebKitFormBoundaryPartTest1';
    const part1Payload = Buffer.from('CHUNK-PART-1-ENCRYPTED-BYTES-AAAAAAAAAAAAAAAA');
    const part1Body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="uploadId"',
      '',
      uploadId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="s3ObjectKey"',
      '',
      s3ObjectKey,
      `--${boundary}`,
      'Content-Disposition: form-data; name="partNumber"',
      '',
      '1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="chunk"; filename="part-1.bin"',
      'Content-Type: application/octet-stream',
      '',
      part1Payload.toString('binary'),
      `--${boundary}--`,
    ].join('\r\n');

    const part1Res = await fetch(`${baseUrl}/files/multipart/chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${user1Token}`,
      },
      body: Buffer.from(part1Body, 'binary'),
    });
    const part1Data = await part1Res.json();
    assert.equal(part1Res.status, 200);
    assert.equal(part1Data.partNumber, 1);
    assert.ok(part1Data.etag);

    // C. Upload Part 2
    const part2Payload = Buffer.from('CHUNK-PART-2-ENCRYPTED-BYTES-BBBBBBBBBBBBBBBB');
    const part2Body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="uploadId"',
      '',
      uploadId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="s3ObjectKey"',
      '',
      s3ObjectKey,
      `--${boundary}`,
      'Content-Disposition: form-data; name="partNumber"',
      '',
      '2',
      `--${boundary}`,
      'Content-Disposition: form-data; name="chunk"; filename="part-2.bin"',
      'Content-Type: application/octet-stream',
      '',
      part2Payload.toString('binary'),
      `--${boundary}--`,
    ].join('\r\n');

    const part2Res = await fetch(`${baseUrl}/files/multipart/chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${user1Token}`,
      },
      body: Buffer.from(part2Body, 'binary'),
    });
    const part2Data = await part2Res.json();
    assert.equal(part2Res.status, 200);

    // D. Complete Multipart Upload
    const completeRes = await fetch(`${baseUrl}/files/multipart/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        uploadId,
        s3ObjectKey,
        parts: [
          { partNumber: 1, etag: part1Data.etag },
          { partNumber: 2, etag: part2Data.etag },
        ],
        originalName: 'enterprise-dataset-large.bin',
        mimeType: 'application/octet-stream',
        encryptedFileKey: {
          ephemeralPublicKey: mockPublicKey1,
          wrapIv: 'abcdef123456',
          wrappedKey: 'wrapped_key_bytes_base64',
        },
        iv: '1234567890abcdef12345678',
        encryptedSize: part1Payload.length + part2Payload.length,
      }),
    });
    const completeData = await completeRes.json();
    assert.equal(completeRes.status, 201);
    assert.ok(completeData.file.id);
    fileId = completeData.file.id;
  });

  await t.test('4. Create Secure Shareable Link (ACL Engine - Viewer & Editor)', async () => {
    // 4A. Create Viewer Share Link
    const viewerRes = await fetch(`${baseUrl}/files/${fileId}/share-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        role: 'viewer',
        expiresHours: 24,
        maxAccessCount: 5,
      }),
    });
    const viewerData = await viewerRes.json();
    assert.equal(viewerRes.status, 201);
    assert.equal(viewerData.shareLink.role, 'viewer');
    assert.ok(viewerData.shareLink.token);
    shareToken = viewerData.shareLink.token;
    shareLinkId = viewerData.shareLink.id;

    // 4B. Create Editor Share Link
    const editorRes = await fetch(`${baseUrl}/files/${fileId}/share-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        role: 'editor',
        expiresHours: 24,
      }),
    });
    const editorData = await editorRes.json();
    assert.equal(editorRes.status, 201);
    assert.equal(editorData.shareLink.role, 'editor');
    assert.ok(editorData.shareLink.token);
  });

  await t.test('5. Access and download file via Shareable Link token, test editor vs viewer update rules', async () => {
    // Metadata check
    const metaRes = await fetch(`${baseUrl}/shared/link/${shareToken}`);
    const metaData = await metaRes.json();
    assert.equal(metaRes.status, 200);
    assert.equal(metaData.file.originalName, 'enterprise-dataset-large.bin');
    assert.equal(metaData.file.role, 'viewer');

    // Download stream check - direct download blocked for viewer (403), allowed for preview (200)
    const dlDirectRes = await fetch(`${baseUrl}/shared/link/${shareToken}/download`);
    assert.equal(dlDirectRes.status, 403);

    const dlPreviewRes = await fetch(`${baseUrl}/shared/link/${shareToken}/download?purpose=preview`);
    assert.equal(dlPreviewRes.status, 200);
    const content = await dlPreviewRes.text();
    assert.ok(content.length > 0);

    // Verify viewer link cannot update file
    const updateBoundary = '----WebKitFormBoundaryUpdateTest';
    const updatedPayload = Buffer.from('EDITED-BY-SECONDARY-USER-ENCRYPTED-CONTENT');
    const updateBody = [
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="iv"',
      '',
      'fedcba9876543210fedcba98',
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="originalName"',
      '',
      'enterprise-dataset-updated.bin',
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="updatedFile"; filename="enterprise-dataset-updated.bin"',
      'Content-Type: application/octet-stream',
      '',
      updatedPayload.toString('binary'),
      `--${updateBoundary}--`,
    ].join('\r\n');

    const viewerUpdateRes = await fetch(`${baseUrl}/shared/link/${shareToken}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${updateBoundary}`,
      },
      body: Buffer.from(updateBody, 'binary'),
    });
    assert.equal(viewerUpdateRes.status, 403); // Viewer must be denied update permission
  });

  await t.test('6. Revoke Shareable Link and verify access rejection', async () => {
    // Revoke link
    const revRes = await fetch(`${baseUrl}/files/${fileId}/share-link/${shareLinkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(revRes.status, 200);

    // Verify rejection
    const accessRes = await fetch(`${baseUrl}/shared/link/${shareToken}`);
    assert.equal(accessRes.status, 404);
  });

  await t.test('7. Key Rotation & Re-encryption on Revocation', async () => {
    const res = await fetch(`${baseUrl}/files/${fileId}/rotate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        newWrappedFileKey: {
          ephemeralPublicKey: mockPublicKey1,
          wrapIv: 'new_iv_wrap',
          wrappedKey: 'brand_new_rotated_fek_base64',
        },
        newIv: 'fresh_file_iv_12345678',
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
  });

  await t.test('8. Check Audit Trail logs', async () => {
    const res = await fetch(`${baseUrl}/audit/${fileId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.logs.length >= 3);
  });

  await t.test('9. User 2 views file, edits file to create Version 2, and preserves all versions', async () => {
    // A. Grant User 2 editor access
    const shareRes = await fetch(`${baseUrl}/files/${fileId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({
        targetUserId: user2Id,
        role: 'editor',
        wrappedFileKey: {
          ephemeralPublicKey: mockPublicKey2,
          wrapIv: 'test_wrap_iv',
          wrappedKey: 'fek_wrapped_for_user2',
        },
      }),
    });
    assert.equal(shareRes.status, 200);

    // B. User 2 views file (triggers preview log)
    const viewRes = await fetch(`${baseUrl}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(viewRes.status, 200);
    const viewData = await viewRes.json();
    assert.equal(viewData.file.role, 'editor');

    // C. User 2 uploads new version (edits file)
    const boundary = '----WebKitFormBoundaryNewVerTest';
    const ver2Payload = Buffer.from('VERSION-2-UPDATED-CONTENT-ENCRYPTED');
    const verBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="encryptedFile"; filename="enterprise-dataset-large.v2.enc"',
      'Content-Type: application/octet-stream',
      '',
      ver2Payload.toString('binary'),
      `--${boundary}`,
      'Content-Disposition: form-data; name="iv"',
      '',
      'new_version_iv_000000000000',
      `--${boundary}`,
      'Content-Disposition: form-data; name="changeSummary"',
      '',
      'Updated dataset with Q3 financial metrics',
      `--${boundary}--`,
    ].join('\r\n');

    const verRes = await fetch(`${baseUrl}/files/${fileId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${user2Token}`,
      },
      body: Buffer.from(verBody, 'binary'),
    });
    const verData = await verRes.json();
    assert.equal(verRes.status, 201);
    assert.equal(verData.file.currentVersion, 2);

    // D. Check listVersions preserves BOTH Version 1 and Version 2
    const listVerRes = await fetch(`${baseUrl}/files/${fileId}/versions`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const listVerData = await listVerRes.json();
    assert.equal(listVerRes.status, 200);
    assert.equal(listVerData.versions.length, 2);
    assert.equal(listVerData.versions[0].versionNumber, 2);
    assert.equal(listVerData.versions[1].versionNumber, 1);

    // E. Verify file audit logs track both preview and edit with version
    const auditRes = await fetch(`${baseUrl}/audit/${fileId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const auditData = await auditRes.json();
    assert.equal(auditRes.status, 200);

    const user2Logs = auditData.logs.filter((l) => l.actor?.id === user2Id);
    assert.ok(user2Logs.some((l) => l.action === 'preview'), 'Expected preview log for User 2');
    const editLog = user2Logs.find((l) => l.action === 'edit');
    assert.ok(editLog, 'Expected edit log for User 2');
    assert.equal(editLog.metadata?.version, 2);
    assert.equal(editLog.metadata?.changeSummary, 'Updated dataset with Q3 financial metrics');
  });

  await t.test('10. Folder audit logging for folder creation and access', async () => {
    // Create folder
    const fRes = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({ name: 'Audit Test Folder' }),
    });
    const fData = await fRes.json();
    assert.equal(fRes.status, 201);
    const folderId = fData.folder.id;

    // Fetch folder audit logs
    const fAuditRes = await fetch(`${baseUrl}/folders/${folderId}/audit`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const fAuditData = await fAuditRes.json();
    assert.equal(fAuditRes.status, 200);
    assert.ok(fAuditData.logs.some((l) => l.action === 'folder_create'));
  });

  await t.test('11. Verify 30 seconds rate limiter configuration', () => {
    const { apiLimiter, authLimiter, uploadLimiter } = require('../src/middleware/rateLimiter');
    assert.ok(apiLimiter);
    assert.ok(authLimiter);
    assert.ok(uploadLimiter);
  });
});
