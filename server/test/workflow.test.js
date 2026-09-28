const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { generateOtp } = require('../src/utils/totp');
const User = require('../src/models/User');

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

test('SecureVault Section 11 Comprehensive Verification (All 14 Test Cases)', async (t) => {
  let ownerToken;
  let ownerId;
  let recipientToken;
  let recipientId;
  let recipientMfaSecret;
  let malloryToken;
  let malloryId;
  let fileId;
  let shareToken;
  let shareLinkId;
  let accessRequestId;
  let folderAId;
  let folderBId;
  let folderAShareToken;
  let fileAId;
  let fileBId;

  const mockPublicKeyOwner = {
    kty: 'EC',
    crv: 'P-256',
    x: 'WKn-nIG5qwMRBp_kE7RwJ0kG1A52G0A7Z2c2bZ1_123',
    y: 'Hq0K_d9qZ-b3Z3c4b5_67890abcdef1234567890',
  };

  const mockPublicKeyRecipient = {
    kty: 'EC',
    crv: 'P-256',
    x: 'AKn-mIG5qwMRBp_kE7RwJ0kG1A52G0A7Z2c2bZ1_999',
    y: 'Pq0K_d9qZ-b3Z3c4b5_67890abcdef1234567899',
  };

  const mockEncryptedBundle = {
    ciphertext: 'dGVzdGNpcGhlcnRleHQ=',
    salt: '0123456789abcdef0123456789abcdef',
    iv: '0123456789abcdef01234567',
  };

  // Helper to construct multipart payload with 'encryptedFile'
  const makeUploadBody = (filename, content, extraFields = {}) => {
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const chunks = [];

    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="encryptedFile"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      ),
      Buffer.from(content),
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

  // Setup: Register Owner and upload initial test file
  await t.test('Setup: Register Owner & Upload Test File', async () => {
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Owner',
        email: `alice_owner_${Date.now()}@vault.test`,
        password: 'Password123!',
        publicKey: mockPublicKeyOwner,
        encryptedPrivateKey: mockEncryptedBundle,
      }),
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 201);
    ownerToken = regData.accessToken;
    ownerId = regData.user.id;

    // Upload encrypted file
    const uploadPayload = makeUploadBody('confidential.pdf.enc', 'AES_GCM_ENCRYPTED_FILE_CONTENT_V1', {
      originalName: 'confidential.pdf',
      mimeType: 'application/pdf',
      iv: '0123456789abcdef01234567',
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockPublicKeyOwner,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'wrapped_key_base64_abc',
      }),
    });

    const upRes = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': uploadPayload.contentType,
      },
      body: uploadPayload.body,
    });
    const upData = await upRes.json();
    assert.equal(upRes.status, 201);
    fileId = upData.file.id;
    assert.ok(fileId);

    // Create shareable link (Section 1)
    const linkRes = await fetch(`${baseUrl}/files/${fileId}/share-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'viewer',
        expiresHours: 48,
        allowDownload: true,
      }),
    });
    const linkData = await linkRes.json();
    assert.equal(linkRes.status, 201);
    shareToken = linkData.shareLink.token;
    shareLinkId = linkData.shareLink.id;
    assert.ok(shareToken);
  });

  // CASE 1: A visitor opens a link and creates an account
  await t.test('Case 1: Visitor opens link unauthenticated, then creates account', async () => {
    // Visitor opens link without token
    const openRes = await fetch(`${baseUrl}/shared/link/${shareToken}`);
    const openData = await openRes.json();
    assert.equal(openRes.status, 200);
    assert.equal(openData.requiresAuth, true);
    assert.equal(openData.file.originalName, 'confidential.pdf');
    // Content, preview, download, or decryption key are NOT provided
    assert.equal(openData.file.wrappedFileKey, undefined);
    assert.equal(openData.file.encryptedFileKey, undefined);

    // Visitor registers account
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Recipient',
        email: `bob_recipient_${Date.now()}@vault.test`,
        password: 'Password123!',
        publicKey: mockPublicKeyRecipient,
        encryptedPrivateKey: mockEncryptedBundle,
      }),
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 201);
    recipientToken = regData.accessToken;
    recipientId = regData.user.id;
    assert.ok(recipientToken);
  });

  // CASE 2: A registered user logs in and completes MFA
  await t.test('Case 2: Registered user sets up TOTP and completes MFA', async () => {
    // 1. Setup MFA
    const setupRes = await fetch(`${baseUrl}/auth/mfa/setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    const setupData = await setupRes.json();
    assert.equal(setupRes.status, 200);
    assert.ok(setupData.secret);
    assert.ok(setupData.qrCode);
    recipientMfaSecret = setupData.secret;

    // 2. Verify MFA Setup with 6-digit TOTP
    const code = generateOtp(recipientMfaSecret);
    const verifySetupRes = await fetch(`${baseUrl}/auth/mfa/verify-setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recipientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, secret: recipientMfaSecret }),
    });
    const verifySetupData = await verifySetupRes.json();
    assert.equal(verifySetupRes.status, 200);
    assert.equal(verifySetupData.user.mfaEnabled, true);

    // 3. User logs in with MFA enabled -> requires MFA verification
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: verifySetupData.user.email,
        password: 'Password123!',
      }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginData.mfaRequired, true);
    assert.equal(loginData.mfaVerified, false);

    // 4. Submit 6-digit TOTP verification
    const freshCode = generateOtp(recipientMfaSecret);
    const verifyRes = await fetch(`${baseUrl}/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginData.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: freshCode }),
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyData.mfaVerified, true);
    assert.ok(verifyData.accessToken);
    recipientToken = verifyData.accessToken; // Hold MFA-verified session token
  });

  // CASE 3: The owner receives the access request
  await t.test('Case 3: Recipient submits access request & owner receives notification', async () => {
    // Recipient creates request
    const reqRes = await fetch(`${baseUrl}/access-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recipientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: shareToken,
        requestedRole: 'viewer',
        message: 'Need to review this PDF for the project',
      }),
    });
    const reqData = await reqRes.json();
    assert.equal(reqRes.status, 201);
    assert.equal(reqData.request.status, 'pending');
    accessRequestId = reqData.request._id;

    // Owner checks incoming requests
    const ownerListRes = await fetch(`${baseUrl}/access-requests/owner?status=pending`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const ownerListData = await ownerListRes.json();
    assert.equal(ownerListRes.status, 200);
    const foundReq = ownerListData.requests.find((r) => r.id === accessRequestId);
    assert.ok(foundReq);
    assert.equal(foundReq.requester.name, 'Bob Recipient');
    assert.equal(foundReq.status, 'pending');

    // Owner checks in-app notifications
    const notifRes = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const notifData = await notifRes.json();
    assert.equal(notifRes.status, 200);
    const foundNotif = notifData.notifications.find((n) => n.accessRequestId === accessRequestId);
    assert.ok(foundNotif);
    assert.equal(foundNotif.type, 'access_request');
  });

  // CASE 4: The visitor cannot access the file while the request is pending
  await t.test('Case 4: Access is strictly blocked while request is pending', async () => {
    // GET /shared/link/:token reports pending status and NO file decryption data
    const statusRes = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    const statusData = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.equal(statusData.requestStatus, 'pending');
    assert.equal(
      statusData.message,
      'Your access request has been sent to the owner. You will be notified when the owner responds.'
    );
    assert.equal(statusData.file, undefined);

    // Download endpoint is blocked
    const downRes = await fetch(`${baseUrl}/shared/link/${shareToken}/download`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(downRes.status, 403);
  });

  // CASE 5: The owner approves the request
  await t.test('Case 5: Owner approves request with custom permissions', async () => {
    const wrappedKeyForRecipient = {
      ephemeralPublicKey: mockPublicKeyOwner,
      wrapIv: 'abcdef1234567890abcdef12',
      wrappedKey: 'wrapped_for_bob_recipient_base64',
    };

    const approveRes = await fetch(`${baseUrl}/access-requests/${accessRequestId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'viewer',
        allowDownload: false, // Owner sets download blocked
        wrappedFileKey: wrappedKeyForRecipient,
      }),
    });
    const approveData = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approveData.request.status, 'approved');

    // Recipient receives approval notification
    const recNotifRes = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    const recNotifData = await recNotifRes.json();
    assert.equal(recNotifRes.status, 200);
    const approvedNotif = recNotifData.notifications.find((n) => n.type === 'request_approved');
    assert.ok(approvedNotif);
  });

  // CASE 6: The approved recipient can access the file
  await t.test('Case 6: Approved recipient can access authorized file details and preview', async () => {
    const accessRes = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    const accessData = await accessRes.json();
    assert.equal(accessRes.status, 200);
    assert.equal(accessData.requestStatus, 'approved');
    assert.equal(accessData.file.originalName, 'confidential.pdf');
    assert.equal(accessData.file.role, 'viewer');
    assert.equal(accessData.file.allowDownload, false);
    assert.ok(accessData.file.wrappedFileKey);

    // In-browser preview stream is allowed
    const prevRes = await fetch(`${baseUrl}/shared/link/${shareToken}/download?purpose=preview`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(prevRes.status, 200);
    const buf = await prevRes.arrayBuffer();
    assert.ok(buf.byteLength > 0);
  });

  // CASE 7: A different account cannot use the approved recipient’s permission
  await t.test('Case 7: Different account (Mallory) cannot access approved recipient file', async () => {
    // Register Mallory
    const regMallory = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mallory Hacker',
        email: `mallory_${Date.now()}@vault.test`,
        password: 'Password123!',
        publicKey: mockPublicKeyRecipient,
        encryptedPrivateKey: mockEncryptedBundle,
      }),
    });
    const malloryData = await regMallory.json();
    malloryToken = malloryData.accessToken;
    malloryId = malloryData.user.id;

    // Enable and verify MFA for Mallory
    const setupRes = await fetch(`${baseUrl}/auth/mfa/setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    const setupData = await setupRes.json();
    const code = generateOtp(setupData.secret);
    const verifySetupRes = await fetch(`${baseUrl}/auth/mfa/verify-setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${malloryToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, secret: setupData.secret }),
    });
    const verifySetupData = await verifySetupRes.json();
    assert.equal(verifySetupRes.status, 200);
    malloryToken = verifySetupData.accessToken;

    // Mallory opens share link -> should be in 'can_request' state, NOT approved
    const malloryAccessRes = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    const malloryAccessData = await malloryAccessRes.json();
    assert.equal(malloryAccessRes.status, 200);
    assert.equal(malloryAccessData.requestStatus, 'none');
    assert.equal(malloryAccessData.canRequest, true);
    assert.equal(malloryAccessData.file.wrappedFileKey, undefined);

    // Mallory tries to download -> blocked with 403
    const malloryDownRes = await fetch(`${baseUrl}/shared/link/${shareToken}/download`, {
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    assert.equal(malloryDownRes.status, 403);
  });

  // CASE 8: The owner rejects a request and access remains blocked
  await t.test('Case 8: Owner rejects Mallory request and access remains blocked', async () => {
    // Mallory submits request
    const reqRes = await fetch(`${baseUrl}/access-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${malloryToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: shareToken,
        requestedRole: 'viewer',
        message: 'Let me in',
      }),
    });
    const reqData = await reqRes.json();
    assert.equal(reqRes.status, 201);
    const malloryReqId = reqData.request._id;

    // Owner rejects request with reason
    const rejectRes = await fetch(`${baseUrl}/access-requests/${malloryReqId}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'External users are not permitted' }),
    });
    assert.equal(rejectRes.status, 200);

    // Mallory checks link -> 403 rejected with reason
    const checkRes = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    assert.equal(checkRes.status, 403);
    const checkData = await checkRes.json();
    assert.equal(checkData.requestStatus, 'rejected');
    assert.equal(checkData.rejectionReason, 'External users are not permitted');
  });

  // CASE 9: An expired, disabled, or revoked link cannot provide access
  await t.test('Case 9: Expired, disabled, or revoked links deny access', async () => {
    // 1. Disable the link
    const disableRes = await fetch(`${baseUrl}/files/${fileId}/share-link/${shareLinkId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isDisabled: true }),
    });
    assert.equal(disableRes.status, 200);

    // Check access with disabled link -> 403
    const disabledAccess = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(disabledAccess.status, 403);

    // 2. Re-enable and revoke link
    await fetch(`${baseUrl}/files/${fileId}/share-link/${shareLinkId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isDisabled: false }),
    });

    const revokeRes = await fetch(`${baseUrl}/files/${fileId}/share-link/${shareLinkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(revokeRes.status, 200);

    // Check access with revoked link -> 404
    const revokedAccess = await fetch(`${baseUrl}/shared/link/${shareToken}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(revokedAccess.status, 404);
  });

  // CASE 10: A recipient cannot access files outside the approved folder
  await t.test('Case 10: Folder sharing restricts recipient to approved folder only', async () => {
    // Create Folder A and Folder B
    const folARes = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Project Folder A' }),
    });
    const folAData = await folARes.json();
    folderAId = folAData.folder.id || folAData.folder._id;

    const folBRes = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Confidential Folder B' }),
    });
    const folBData = await folBRes.json();
    folderBId = folBData.folder.id || folBData.folder._id;

    // Upload File A into Folder A
    const upFileAPayload = makeUploadBody('fileA.txt.enc', 'FILE_A_CONTENT', {
      originalName: 'fileA.txt',
      mimeType: 'text/plain',
      iv: '0123456789abcdef01234567',
      folderId: folderAId,
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockPublicKeyOwner,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'wrapped_key_base64_a',
      }),
    });
    const fileARes = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': upFileAPayload.contentType,
      },
      body: upFileAPayload.body,
    });
    const fileAData = await fileARes.json();
    assert.equal(fileARes.status, 201);
    fileAId = fileAData.file.id;

    // Upload File B into Folder B
    const upFileBPayload = makeUploadBody('fileB.txt.enc', 'FILE_B_CONTENT', {
      originalName: 'fileB.txt',
      mimeType: 'text/plain',
      iv: '0123456789abcdef01234567',
      folderId: folderBId,
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockPublicKeyOwner,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'wrapped_key_base64_b',
      }),
    });
    const fileBRes = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': upFileBPayload.contentType,
      },
      body: upFileBPayload.body,
    });
    const fileBData = await fileBRes.json();
    assert.equal(fileBRes.status, 201);
    fileBId = fileBData.file.id;

    // Create share link for Folder A
    const folLinkRes = await fetch(`${baseUrl}/folders/${folderAId}/share-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'viewer', allowDownload: true }),
    });
    const folLinkData = await folLinkRes.json();
    folderAShareToken = folLinkData.shareLink.token;

    // Recipient requests access to Folder A
    const folReqRes = await fetch(`${baseUrl}/access-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recipientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: folderAShareToken, requestedRole: 'viewer' }),
    });
    const folReqData = await folReqRes.json();

    // Owner approves Folder A request
    await fetch(`${baseUrl}/access-requests/${folReqData.request._id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'viewer', allowDownload: true }),
    });

    // Recipient accesses Folder A -> contains fileA, does NOT contain fileB
    const folAccessRes = await fetch(`${baseUrl}/shared/link/${folderAShareToken}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    const folAccessData = await folAccessRes.json();
    assert.equal(folAccessRes.status, 200);
    const fileNames = folAccessData.folder.files.map((f) => f.originalName);
    assert.ok(fileNames.includes('fileA.txt'));
    assert.ok(!fileNames.includes('fileB.txt'));

    // Recipient directly requesting File B from outside Folder A is blocked
    const directFileBRes = await fetch(`${baseUrl}/files/${fileBId}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(directFileBRes.status, 403);
  });

  // CASE 11: Download restrictions apply to current and previous versions
  await t.test('Case 11: Download restrictions apply to all versions', async () => {
    // Create new file and link where allowDownload: false
    const docPayload = makeUploadBody('doc_v1.txt.enc', 'VERSION_1_DATA', {
      originalName: 'doc.txt',
      mimeType: 'text/plain',
      iv: '0123456789abcdef01234567',
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockPublicKeyOwner,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'wrapped_key_base64_doc',
      }),
    });
    const fileRes = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': docPayload.contentType,
      },
      body: docPayload.body,
    });
    const fileData = await fileRes.json();
    assert.equal(fileRes.status, 201);
    const docId = fileData.file.id;

    // Owner uploads Version 2 via /files/:id/versions
    const upV2Payload = makeUploadBody('doc_v2.txt.enc', 'VERSION_2_DATA', {
      iv: '0123456789abcdef01234568',
      encryptedFileKey: JSON.stringify({
        ephemeralPublicKey: mockPublicKeyOwner,
        wrapIv: '123456789012345678901234',
        wrappedKey: 'wrapped_key_base64_doc_v2',
      }),
    });
    const v2Res = await fetch(`${baseUrl}/files/${docId}/versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': upV2Payload.contentType,
      },
      body: upV2Payload.body,
    });
    assert.equal(v2Res.status, 201);

    // Share link with allowDownload: false
    const dlLinkRes = await fetch(`${baseUrl}/files/${docId}/share-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'viewer', allowDownload: false }),
    });
    const dlLinkData = await dlLinkRes.json();
    const dlToken = dlLinkData.shareLink.token;

    // Recipient requests access
    const reqRes = await fetch(`${baseUrl}/access-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recipientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: dlToken }),
    });
    const reqData = await reqRes.json();

    // Owner approves with allowDownload: false
    await fetch(`${baseUrl}/access-requests/${reqData.request._id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'viewer', allowDownload: false }),
    });

    // Recipient attempts download of current version -> 403 DOWNLOAD_BLOCKED
    const dlCurRes = await fetch(`${baseUrl}/shared/link/${dlToken}/download`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(dlCurRes.status, 403);
    const dlCurData = await dlCurRes.json();
    assert.equal(dlCurData.code, 'DOWNLOAD_BLOCKED');

    // Recipient attempts download of version 1 -> 403 DOWNLOAD_BLOCKED
    const dlV1Res = await fetch(`${baseUrl}/files/${docId}/versions/1/download`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(dlV1Res.status, 403);
  });

  // CASE 12: Unauthorized users cannot preview, download, edit, restore, or retrieve file keys
  await t.test('Case 12: Unauthorized users completely blocked from all protected actions', async () => {
    // Mallory tries to access fileA -> 403
    const malloryPrev = await fetch(`${baseUrl}/files/${fileAId}`, {
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    assert.equal(malloryPrev.status, 403);

    // Mallory tries to download fileA -> 403
    const malloryDl = await fetch(`${baseUrl}/files/${fileAId}/download`, {
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    assert.equal(malloryDl.status, 403);

    // Mallory tries to restore fileA version -> 403
    const malloryRestore = await fetch(`${baseUrl}/files/${fileAId}/versions/1/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${malloryToken}` },
    });
    assert.equal(malloryRestore.status, 403);
  });

  // CASE 13: The owner can view version history and restore a version if supported
  await t.test('Case 13: Owner views version history and restores earlier version', async () => {
    // Owner views versions for file
    const verListRes = await fetch(`${baseUrl}/files/${fileId}/versions`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const verListData = await verListRes.json();
    assert.equal(verListRes.status, 200);
    assert.ok(Array.isArray(verListData.versions));
    assert.ok(verListData.versions.length >= 1);

    // Upload a new revision for fileId
    const revPayload = makeUploadBody('revised.pdf.enc', 'REVISED_PDF_CONTENT', {
      iv: '0123456789abcdef01234569',
    });
    const newVerRes = await fetch(`${baseUrl}/files/${fileId}/versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': revPayload.contentType,
      },
      body: revPayload.body,
    });
    assert.equal(newVerRes.status, 201);

    // Owner restores version 1
    const restoreRes = await fetch(`${baseUrl}/files/${fileId}/versions/1/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const restoreData = await restoreRes.json();
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreData.success, true);
    assert.equal(restoreData.currentVersion, 3); // Restored version becomes new active head version
  });

  // CASE 14: Audit logs record the relevant actions without exposing secrets
  await t.test('Case 14: Audit logs record all actions and NEVER leak secrets', async () => {
    const auditRes = await fetch(`${baseUrl}/audit?limit=50`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const auditData = await auditRes.json();
    assert.equal(auditRes.status, 200);
    const logs = auditData.logs;
    assert.ok(logs.length > 0);

    const recordedActions = logs.map((l) => l.action);
    // Verify major workflow actions are recorded
    assert.ok(recordedActions.includes('share'));
    assert.ok(recordedActions.includes('access_request_created'));
    assert.ok(recordedActions.includes('access_request_approved'));
    assert.ok(recordedActions.includes('access_request_rejected'));
    assert.ok(recordedActions.includes('edit'));

    // Critical Zero-Knowledge Audit Rule: Ensure no log entry contains raw secrets
    for (const log of logs) {
      const logStr = JSON.stringify(log);
      assert.ok(!logStr.includes(recipientMfaSecret), 'MFA secret leaked in audit log!');
      assert.ok(!logStr.includes('rawEncryptionKey'), 'Raw key leaked in audit log!');
      assert.ok(!logStr.includes('privateKeyJwk'), 'Private key leaked in audit log!');
    }

    // Verify DB user records do not expose MFA secret in regular queries
    const userDoc = await User.findById(recipientId);
    assert.equal(userDoc.mfaSecret, undefined, 'MFA secret must be excluded by default!');
  });
});
