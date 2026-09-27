const AuditLog = require('../models/AuditLog');

class AuditService {
  /**
   * Log an audit event.
   * @param {Object} params
   * @param {string} [params.fileId]
   * @param {string} params.actorId
   * @param {string} params.action
   * @param {string} [params.ipAddress]
   * @param {Object} [params.metadata]
   */
  async log({ fileId = null, folderId = null, actorId, action, ipAddress = null, metadata = {} }) {
    try {
      // Ensure no sensitive fields leak into metadata
      const sanitizedMeta = { ...metadata };
      delete sanitizedMeta.password;
      delete sanitizedMeta.passwordHash;
      delete sanitizedMeta.token;
      delete sanitizedMeta.jwt;
      delete sanitizedMeta.privateKey;
      delete sanitizedMeta.secretKey;
      delete sanitizedMeta.fileKey;

      const fId = folderId || sanitizedMeta.folderId || null;

      await AuditLog.create({
        fileId: fileId || null,
        folderId: fId,
        actorId,
        action,
        ipAddress,
        metadata: sanitizedMeta,
        timestamp: new Date(),
      });
    } catch (err) {
      // Audit failures should not crash user operations, but should be logged securely
      console.error('[Audit Service Error] Failed to write audit record:', err.message);
    }
  }

  /**
   * Get audit logs for a specific file.
   * @param {string} fileId
   * @param {number} limit
   */
  async getFileLogs(fileId, limit = 50) {
    return AuditLog.find({ fileId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('actorId', 'name email role avatar');
  }

  /**
   * Get audit logs for a specific folder.
   * @param {string} folderId
   * @param {number} limit
   */
  async getFolderLogs(folderId, limit = 50) {
    return AuditLog.find({
      $or: [{ folderId }, { 'metadata.folderId': folderId }],
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('actorId', 'name email role avatar');
  }

  /**
   * Get all system audit logs for an actor or administrator.
   * @param {Object} filter
   * @param {number} limit
   */
  async getLogs(filter = {}, limit = 100) {
    return AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('actorId', 'name email role')
      .populate('fileId', 'originalName s3ObjectKey');
  }
}

module.exports = new AuditService();
