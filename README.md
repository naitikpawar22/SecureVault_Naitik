# SecureVault – Zero-Knowledge Secure File Sharing Application

**SecureVault** is an enterprise-grade, end-to-end encrypted (E2EE) zero-knowledge file sharing web application. Files are encrypted client-side in browser memory using **AES-256-GCM** before transmission, large files up to **1GB+** are uploaded using **S3 Multipart Chunked Uploads**, and encryption keys are exchanged using **ECDH (NIST P-256)** or secure tokenized share links.

---

## 1. Fulfillment of Requirements (`securevalutrequirement.txt`)

| Requirement | Implementation & Architectural Details |
| :--- | :--- |
| **1. Client-Side Encryption** | Intercepts file upload in React. Generates a random 256-bit symmetric key (`FEK`) via Web Crypto API (`window.crypto.subtle`). Encrypts entire file content into an AES-256-GCM ciphertext blob in browser memory before network transmission. |
| **2. Chunked Upload (1GB+)** | Slices encrypted files into 5MB chunks. Frontend calls `/api/files/multipart/initiate`, streams chunks via `/api/files/multipart/chunk` into AWS S3 using `UploadPartCommand`, and completes via `/api/files/multipart/complete` using `CompleteMultipartUploadCommand`. |
| **3. Access Control (ACL) Engine** | Dedicated MongoDB collections: `FilePermission` (user-specific ACL) and `FileShareLink` (tokenized link ACL). If an unauthorized user or missing JWT attempts to access chunks, the backend rejects with 401/403. |
| **4. Zero-Knowledge Key Sharing** | Decryption keys are never stored in raw form on the server. Shared via **ECDH P-256 key agreement** with recipient's public key, OR embedded in share links via URL hash fragments (`#key=...`) which browsers never send to the server. |
| **5. Access Revocation & Key Rotation** | Implements **Cryptographic Key Rotation**: When access is revoked, the owner re-encrypts the file with a fresh FEK and uploads the new ciphertext to S3, invalidating all old access keys and links. |
| **6. Database Sharding by User** | Collections indexed by `{ ownerId: 1 }` and `{ userId: 1 }` to support horizontal MongoDB Atlas sharding. |
| **7. Immutable Audit Trails** | Every event (`upload`, `download`, `share`, `revoke`, `delete`, `login`) is logged with timestamp, actor, and IP address. Accessible via `GET /api/audit/:fileId`. |

---

## 2. Cryptographic Architecture & Key Management

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 KEY STORAGE OVERVIEW                                   │
├────────────────────┬──────────────────────┬────────────────────────────────────────────┤
│ Key                │ Cryptographic Spec   │ Where It Is Stored                         │
├────────────────────┼──────────────────────┼────────────────────────────────────────────┤
│ User Public Key    │ ECDH (NIST P-256)    │ MongoDB Atlas: `User.publicKey` (JWK)      │
│ User Private Key   │ ECDH (NIST P-256)    │ Browser memory only (encrypted in DB via   │
│                    │                      │ PBKDF2 SHA-256 100k rounds + AES-256-GCM)  │
│ File Key (FEK)     │ AES-256-GCM (256-bit)│ Wrapped via ECDH for owner and recipients; │
│                    │                      │ or in URL fragment (`#key=...`) for links. │
└────────────────────┴──────────────────────┴────────────────────────────────────────────┘
```

---

## 3. Technology Stack

* **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Web Crypto API (`SubtleCrypto`).
* **Backend**: Node.js, Express.js, Helmet, CORS, Express Rate Limit, Multer.
* **Storage**: Amazon S3 (Bucket: `securevault-naitik-files-2026` in `eu-north-1`) with S3 Multipart Upload and local encrypted vault fallback.
* **Database**: MongoDB Atlas (`securevault` database) with Mongoose schemas and compound indexes.

---

## 4. API Endpoints

### Authentication
* `POST /api/auth/register` – Register account with ECDH public key & encrypted private key bundle.
* `POST /api/auth/login` – Authenticate with master password; returns JWT and encrypted private key.
* `POST /api/auth/refresh` – Rotate refresh token.
* `POST /api/auth/logout` – Invalidate session and log audit event.

### S3 Multipart Uploads (1GB+ files)
* `POST /api/files/multipart/initiate` – Start S3 multipart upload session; returns `uploadId` and `s3ObjectKey`.
* `POST /api/files/multipart/chunk` – Upload individual 5MB encrypted chunk part to S3.
* `POST /api/files/multipart/complete` – Complete multipart upload, assemble object, commit metadata.
* `POST /api/files/multipart/abort` – Abort multipart upload.

### File Operations & Access Control
* `POST /api/files/upload` – Standard single upload for small files.
* `GET /api/files` – List accessible files (owned + shared).
* `GET /api/files/:id` – Fetch metadata and recipient's wrapped file key.
* `GET /api/files/:id/download` – Stream encrypted ciphertext from S3.
* `DELETE /api/files/:id` – Permanently delete file and permissions (Owner only).

### Sharing & ACLs
* `POST /api/files/:id/share` – Grant viewer access to user using ECDH key wrapping.
* `GET /api/files/:id/permissions` – List permissions for file.
* `DELETE /api/files/:id/permissions/:userId` – Revoke user access.
* `POST /api/files/:id/share-link` – Create secure shareable link with optional expiration & max uses.
* `GET /api/files/:id/share-links` – List active shareable links for file.
* `DELETE /api/files/:id/share-link/:linkId` – Revoke shareable link.
* `GET /api/shared/link/:token` – Public link metadata check.
* `GET /api/shared/link/:token/download` – Public link encrypted stream download.

### Key Rotation
* `POST /api/files/:id/rotate-key` – Re-encrypt file with brand-new key after access revocation.

### Audit Trail
* `GET /api/audit/:id` – Retrieve file-specific audit log history.
* `GET /api/audit` – General user / admin audit trail.

---

## 5. Running the Application

### Start Development Server (Frontend + Backend):
```bash
npm run dev
```
* **Frontend**: http://localhost:5173
* **Backend API**: http://localhost:5000
* **Health Check**: http://localhost:5000/api/health

### Run Test Suite:
```bash
cd server
npm test
```
*(All automated tests pass with 0 errors).*
