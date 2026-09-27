// Dynamic API Base URL:
// 1. Explicit Vite environment variable (e.g. VITE_API_URL=https://api.naitik.app)
// 2. Localhost or 127.0.0.1 -> '/api' (proxied by Vite dev server to localhost:5000)
// 3. Production domain (naitik.app / others) -> 'https://api.naitik.app/api'
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/api';
    }
  }
  return 'https://api.naitik.app/api';
};

const API_BASE = getApiBase();

/**
 * Helper to execute authorized fetch requests
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('securevault_token');
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set default JSON Content-Type unless payload is FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle session expiration
  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('securevault_token');
      localStorage.removeItem('securevault_user');
      window.dispatchEvent(new Event('auth_expired'));
    }
    throw new Error(errorData.error || 'Authentication required');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }

  // If response is raw binary/stream (e.g. file download)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/octet-stream') || response.headers.get('content-disposition')) {
    const blob = await response.blob();
    return {
      blob,
      iv: response.headers.get('x-encryption-iv'),
      algorithm: response.headers.get('x-encryption-algorithm'),
    };
  }

  return await response.json();
}

export const api = {
  // Authentication
  auth: {
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    getMe: () => request('/auth/me'),
  },

  // Files
  files: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.folderId !== undefined && params.folderId !== null) q.set('folderId', params.folderId);
      if (params.all) q.set('all', 'true');
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request(`/files${qs}`);
    },
    get: (id) => request(`/files/${id}`),
    upload: (formData) => request('/files/upload', { method: 'POST', body: formData }),
    download: (id) => request(`/files/${id}/download`),
    delete: (id) => request(`/files/${id}`, { method: 'DELETE' }),

    // File Rename
    rename: (id, name) => request(`/files/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }),

    // Multipart Chunked Upload (for 1GB+ large files)
    initiateMultipart: (data) => request('/files/multipart/initiate', { method: 'POST', body: JSON.stringify(data) }),
    uploadChunk: (formData) => request('/files/multipart/chunk', { method: 'POST', body: formData }),
    completeMultipart: (data) => request('/files/multipart/complete', { method: 'POST', body: JSON.stringify(data) }),
    abortMultipart: (data) => request('/files/multipart/abort', { method: 'POST', body: JSON.stringify(data) }),

    // Shareable Links (ACL Engine)
    createShareLink: (fileId, data) => request(`/files/${fileId}/share-link`, { method: 'POST', body: JSON.stringify(data) }),
    listShareLinks: (fileId) => request(`/files/${fileId}/share-links`),
    getShareLinks: (fileId) => request(`/files/${fileId}/share-links`), // Alias for compatibility
    revokeShareLink: (fileId, linkId) => request(`/files/${fileId}/share-link/${linkId}`, { method: 'DELETE' }),

    // Key Rotation & Re-encryption
    rotateKey: (fileId, formData) => request(`/files/${fileId}/rotate-key`, { method: 'POST', body: formData }),

    // File Versions
    listVersions: (fileId) => request(`/files/${fileId}/versions`),
    createVersion: (fileId, formData) => request(`/files/${fileId}/versions`, { method: 'POST', body: formData }),
    downloadVersion: (fileId, versionNumber, purpose = '') => {
      const qs = purpose ? `?purpose=${encodeURIComponent(purpose)}` : '';
      return request(`/files/${fileId}/versions/${versionNumber}/download${qs}`);
    },
    restoreVersion: (fileId, versionNumber) => request(`/files/${fileId}/versions/${versionNumber}/restore`, { method: 'POST' }),
  },

  // Folders
  folders: {
    list: (params = null) => {
      let q = new URLSearchParams();
      if (typeof params === 'string') {
        if (params && params !== 'root') q.set('parentId', params);
      } else if (params && typeof params === 'object') {
        if (params.parentId && params.parentId !== 'root') q.set('parentId', params.parentId);
        if (params.shared) q.set('shared', 'true');
      }
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request(`/folders${qs}`);
    },
    create: (data) => request('/folders', { method: 'POST', body: JSON.stringify(data) }),
    rename: (id, name) => request(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    delete: (id) => request(`/folders/${id}`, { method: 'DELETE' }),

    // Folder Sharing
    share: (id, data) => request(`/folders/${id}/share`, { method: 'POST', body: JSON.stringify(data) }),
    listPermissions: (id) => request(`/folders/${id}/permissions`),
    revokePermission: (id, userId) => request(`/folders/${id}/permissions/${userId}`, { method: 'DELETE' }),
    createShareLink: (id, data) => request(`/folders/${id}/share-link`, { method: 'POST', body: JSON.stringify(data) }),
    listShareLinks: (id) => request(`/folders/${id}/share-links`),
    getShareLinks: (id) => request(`/folders/${id}/share-links`),
    revokeShareLink: (id, linkId) => request(`/folders/${id}/share-link/${linkId}`, { method: 'DELETE' }),
    getLogs: (id) => request(`/folders/${id}/audit`),
  },

  // Direct User-to-User Sharing & Permissions
  permissions: {
    share: (fileId, data) => request(`/files/${fileId}/share`, { method: 'POST', body: JSON.stringify(data) }),
    shareBatch: (fileId, data) => request(`/files/${fileId}/share-batch`, { method: 'POST', body: JSON.stringify(data) }),
    updateRole: (fileId, userId, role) => request(`/files/${fileId}/permissions/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    list: (fileId) => request(`/files/${fileId}/permissions`),
    revoke: (fileId, userId) => request(`/files/${fileId}/permissions/${userId}`, { method: 'DELETE' }),
  },

  // Public / Tokenized Shared Links
  shared: {
    getLinkFile: (token) => request(`/shared/link/${token}`),
    downloadLinkFile: (token, purpose = '') => {
      const qs = purpose ? `?purpose=${encodeURIComponent(purpose)}` : '';
      return request(`/shared/link/${token}/download${qs}`);
    },
    updateLinkFile: (token, formData) => request(`/shared/link/${token}/update`, { method: 'POST', body: formData }),
  },

  // Audit Logs
  audit: {
    getMyLogs: () => request('/audit'),
    getFileLogs: (fileId) => request(`/audit/${fileId}`),
  },

  // User Directory & Profile
  users: {
    lookup: (email) => request(`/users/lookup?email=${encodeURIComponent(email)}`),
    search: (query = '') => request(`/users?query=${encodeURIComponent(query)}`),
    getPublicKey: (id) => request(`/users/${id}/public-key`),
    updateProfile: (data) => request('/users/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  },
};
