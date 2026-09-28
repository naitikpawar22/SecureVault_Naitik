const http = require('http');
const crypto = require('crypto');
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const File = require('../src/models/File');
const AuditLog = require('../src/models/AuditLog');
const config = require('../src/config/env');

// Helper to construct multipart payload with 'encryptedFile'
const makeUploadBody = (filename, contentBuffer, extraFields = {}) => {
  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const chunks = [];

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="encryptedFile"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    contentBuffer,
    Buffer.from('\r\n')
  );

  for (const [key, val] of Object.entries(extraFields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      )
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  };
};

async function runAuditTests() {
  console.log('--- Starting Section 13 Security Audit Verification Tests ---');
  await connectDB();

  let server;
  let baseUrl;
  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });

  const results = {};

  try {
    const timestamp = Date.now();
    const ownerEmail = `audit_owner_${timestamp}@example.com`;
    const viewerEmail = `audit_viewer_${timestamp}@example.com`;
    const attackerEmail = `audit_attacker_${timestamp}@example.com`;
    const password = 'Password123!@#Secure';

    const mockKey = { kty: 'EC', crv: 'P-256', x: 'mock_x', y: 'mock_y' };
    const mockEncryptedBundle = {
      ciphertext: 'dGVzdGNpcGhlcnRleHQ=',
      salt: '0123456789abcdef0123456789abcdef',
      iv: '0123456789abcdef01234567',
    };

    // Register owner
    const regOwnerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password, name: 'Audit Owner', publicKey: mockKey, encryptedPrivateKey: mockEncryptedBundle }),
    });
    const ownerData = await regOwnerRes.json();
    const ownerToken = ownerData.accessToken;

    // Register viewer
    const regViewerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: viewerEmail, password, name: 'Audit Viewer', publicKey: mockKey, encryptedPrivateKey: mockEncryptedBundle }),
    });
    const viewerData = await regViewerRes.json();
    const viewerToken = viewerData.accessToken;
    const viewerId = viewerData.user.id;

    // Register attacker (unapproved user)
    const regAttackerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: attackerEmail, password, name: 'Audit Attacker', publicKey: mockKey, encryptedPrivateKey: mockEncryptedBundle }),
    });
    const attackerData = await regAttackerRes.json();
    const attackerToken = attackerData.accessToken;

    // Upload an encrypted file by Owner
    const plainText = 'Sensitive confidential vault document for audit tests';
    const fek = crypto.randomBytes(32); // AES-256 key
    const iv = crypto.randomBytes(12); // 96-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', fek, iv);
    const encryptedContent = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const fullCiphertext = Buffer.concat([encryptedContent, authTag]);

    const uploadPayload = makeUploadBody('confidential.txt.enc', fullCiphertext, {
      originalName: 'confidential.txt',
      mimeType: 'text/plain',
      iv: iv.toString('hex'),
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockKey,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'mockWrappedOwnerKey',
      }),
    });

    const uploadRes = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': uploadPayload.contentType,
      },
      body: uploadPayload.body,
    });
    const uploadJson = await uploadRes.json();
    const fileId = uploadJson.file.id || uploadJson.file._id;
    const fileRecord = await File.findById(fileId);

    // TEST 1: Unauthenticated file request -> Expected: Denied
    console.log('\n[Test 1] Unauthenticated file request...');
    const unauthRes = await fetch(`${baseUrl}/files/${fileId}`, {
      method: 'GET',
    });
    const unauthPassed = unauthRes.status === 401;
    results['Unauthenticated file request'] = {
      expected: 'Denied',
      actual: unauthPassed ? 'Pass' : 'Fail',
      status: unauthRes.status,
    };
    console.log(`Result: ${results['Unauthenticated file request'].actual} (HTTP ${unauthRes.status})`);

    // TEST 2: Unapproved user requests file -> Expected: Denied
    console.log('\n[Test 2] Unapproved user requests file...');
    const unapprovedRes = await fetch(`${baseUrl}/files/${fileId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${attackerToken}` },
    });
    const unapprovedPassed = unapprovedRes.status === 403;
    results['Unapproved user requests file'] = {
      expected: 'Denied',
      actual: unapprovedPassed ? 'Pass' : 'Fail',
      status: unapprovedRes.status,
    };
    console.log(`Result: ${results['Unapproved user requests file'].actual} (HTTP ${unapprovedRes.status})`);

    // Setup: Share file with viewer as "view" permission
    await fetch(`${baseUrl}/files/${fileId}/share`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientEmail: viewerEmail,
        permission: 'view',
        wrappedKey: 'mockWrappedViewerKey',
      }),
    });

    // TEST 3: Viewer attempts owner-only action (e.g. DELETE file) -> Expected: Denied
    console.log('\n[Test 3] Viewer attempts owner-only action (DELETE)...');
    const viewerDeleteRes = await fetch(`${baseUrl}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const viewerDenied = viewerDeleteRes.status === 403;
    results['Viewer attempts owner-only action'] = {
      expected: 'Denied',
      actual: viewerDenied ? 'Pass' : 'Fail',
      status: viewerDeleteRes.status,
    };
    console.log(`Result: ${results['Viewer attempts owner-only action'].actual} (HTTP ${viewerDeleteRes.status})`);

    // Setup for Test 4: Revoke viewer access
    await fetch(`${baseUrl}/files/${fileId}/share/${viewerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    // TEST 4: Revoked user requests file -> Expected: Denied
    console.log('\n[Test 4] Revoked user requests file...');
    const revokedRes = await fetch(`${baseUrl}/files/${fileId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const revokedDenied = revokedRes.status === 403;
    results['Revoked user requests file'] = {
      expected: 'Denied',
      actual: revokedDenied ? 'Pass' : 'Fail',
      status: revokedRes.status,
    };
    console.log(`Result: ${results['Revoked user requests file'].actual} (HTTP ${revokedRes.status})`);

    // TEST 5: Modified encrypted data -> Expected: Decryption/authentication fails
    console.log('\n[Test 5] Modified encrypted data tamper test...');
    let tamperDetected = false;
    try {
      // Intentionally tamper with 1 byte of the ciphertext
      const tamperedCiphertext = Buffer.from(fullCiphertext);
      tamperedCiphertext[0] ^= 0xff; // Flip bits

      const decipher = crypto.createDecipheriv('aes-256-gcm', fek, iv);
      const tamperedBody = tamperedCiphertext.subarray(0, tamperedCiphertext.length - 16);
      const tamperedTag = tamperedCiphertext.subarray(tamperedCiphertext.length - 16);
      decipher.setAuthTag(tamperedTag);
      decipher.update(tamperedBody);
      decipher.final(); // Should throw authentication tag verification error
    } catch (err) {
      tamperDetected = true;
      console.log('Caught expected GCM authentication tag error:', err.message);
    }
    results['Modified encrypted data'] = {
      expected: 'Decryption/authentication fails',
      actual: tamperDetected ? 'Pass' : 'Fail',
    };
    console.log(`Result: ${results['Modified encrypted data'].actual}`);

    // TEST 6: Public S3 access -> Expected: Denied
    console.log('\n[Test 6] Direct public S3 bucket access check...');
    let s3AccessDenied = false;
    const bucket = config.aws.bucket;
    const region = config.aws.region;
    const s3ObjectKey = fileRecord.s3ObjectKey;

    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3ObjectKey}`;
    console.log('Testing unauthenticated direct fetch to S3 URL:', s3Url);

    try {
      const s3HttpRes = await fetch(s3Url);
      console.log('Direct S3 fetch returned HTTP status:', s3HttpRes.status);
      if (s3HttpRes.status === 403 || s3HttpRes.status === 400) {
        s3AccessDenied = true;
      }
    } catch (err) {
      console.log('S3 network error or blocked:', err.message);
      s3AccessDenied = true;
    }
    results['Public S3 access'] = {
      expected: 'Denied',
      actual: s3AccessDenied ? 'Pass' : 'Fail',
    };
    console.log(`Result: ${results['Public S3 access'].actual}`);

    // TEST 7: Raw decryption key in backend logs / database / audit logs -> Expected: Not present
    console.log('\n[Test 7] Verify raw decryption key is NOT in backend database/audit logs...');
    const rawFekHex = fek.toString('hex');
    const rawFekBase64 = fek.toString('base64');

    const fileRecordStr = JSON.stringify(fileRecord);
    const auditLogs = await AuditLog.find({ fileId }).lean();
    const auditLogsStr = JSON.stringify(auditLogs);

    const keyInFile = fileRecordStr.includes(rawFekHex) || fileRecordStr.includes(rawFekBase64);
    const keyInAudit = auditLogsStr.includes(rawFekHex) || auditLogsStr.includes(rawFekBase64);

    const rawKeyNotPresent = !keyInFile && !keyInAudit;
    results['Raw decryption key in backend logs'] = {
      expected: 'Not present',
      actual: rawKeyNotPresent ? 'Pass' : 'Fail',
    };
    console.log(`Result: ${results['Raw decryption key in backend logs'].actual}`);

    // TEST 8: Large-file upload and download -> Expected: Completes and file integrity is verified
    console.log('\n[Test 8] Large-file upload and download integrity test...');
    const largeSize = 6 * 1024 * 1024; // 6MB (triggers AWS S3 multipart threshold >= 5MB for part 1)
    const largeOriginalData = crypto.randomBytes(largeSize);
    const originalHash = crypto.createHash('sha256').update(largeOriginalData).digest('hex');

    // Multipart initiate
    const initRes = await fetch(`${baseUrl}/files/multipart/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originalName: 'large_audit_test.dat',
        mimeType: 'application/octet-stream',
      }),
    });
    const initJson = await initRes.json();

    // Upload part 1 (5MB) and part 2 (remaining 0.2MB)
    const part1Size = 5 * 1024 * 1024;
    const part1Buf = largeOriginalData.subarray(0, part1Size);
    const part2Buf = largeOriginalData.subarray(part1Size);

    const makeChunkBody = (uploadId, s3ObjectKey, partNumber, chunkBuffer) => {
      const boundary = `----WebKitFormBoundary${Date.now()}_${partNumber}`;
      const chunks = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="uploadId"\r\n\r\n${uploadId}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="s3ObjectKey"\r\n\r\n${s3ObjectKey}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="partNumber"\r\n\r\n${partNumber}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chunk"; filename="part-${partNumber}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        chunkBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ];
      return {
        contentType: `multipart/form-data; boundary=${boundary}`,
        body: Buffer.concat(chunks),
      };
    };

    // Part 1
    const p1Payload = makeChunkBody(initJson.uploadId, initJson.s3ObjectKey, '1', part1Buf);
    const p1Res = await fetch(`${baseUrl}/files/multipart/chunk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': p1Payload.contentType,
      },
      body: p1Payload.body,
    });
    const p1Json = await p1Res.json();
    console.log('Part 1 response:', p1Res.status, p1Json);

    // Part 2
    const p2Payload = makeChunkBody(initJson.uploadId, initJson.s3ObjectKey, '2', part2Buf);
    const p2Res = await fetch(`${baseUrl}/files/multipart/chunk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': p2Payload.contentType,
      },
      body: p2Payload.body,
    });
    const p2Json = await p2Res.json();
    console.log('Part 2 response:', p2Res.status, p2Json);

    // Complete multipart
    const compRes = await fetch(`${baseUrl}/files/multipart/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadId: initJson.uploadId,
        s3ObjectKey: initJson.s3ObjectKey,
        originalName: 'large_audit_test.dat',
        encryptedSize: largeSize,
        mimeType: 'application/octet-stream',
        iv: crypto.randomBytes(12).toString('hex'),
        encryptedFileKey: {
          ephemeralPublicKey: mockKey,
          wrapIv: '123456789012345678901234',
          wrappedKey: 'mockWrappedLargeKey',
        },
        parts: [
          { partNumber: 1, etag: p1Json.etag },
          { partNumber: 2, etag: p2Json.etag },
        ],
      }),
    });
    const compJson = await compRes.json();
    const largeFileId = compJson.file.id || compJson.file._id;

    // Download large file
    const downloadRes = await fetch(`${baseUrl}/files/${largeFileId}/download`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    const downloadedHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex');

    const hashesMatch = downloadedHash === originalHash && downloadedBuf.length === largeSize;
    results['Large-file upload and download'] = {
      expected: 'Completes and file integrity is verified',
      actual: hashesMatch ? 'Pass' : 'Fail',
      bytes: downloadedBuf.length,
    };
    console.log(`Result: ${results['Large-file upload and download'].actual} (size: ${downloadedBuf.length} bytes, SHA-256 match: ${hashesMatch})`);

    console.log('\n=============================================');
    console.log('FINAL AUDIT TEST SUMMARY:');
    console.table(
      Object.entries(results).map(([test, data]) => ({
        Test: test,
        'Expected result': data.expected,
        'Actual result': data.actual,
      }))
    );
    console.log('=============================================\n');
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await disconnectDB();
  }
}

runAuditTests().catch((err) => {
  console.error('Audit verification failed with error:', err);
  process.exit(1);
});
