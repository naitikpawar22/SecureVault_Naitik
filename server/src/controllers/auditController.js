const auditService = require('../services/auditService');
const File = require('../models/File');
const Folder = require('../models/Folder');

const getFileAuditLogs = async (req, res, next) => {
  try {
    // req.fileDoc was verified by checkFileAccess('viewer')
    const file = req.fileDoc;
    const logs = await auditService.getFileLogs(file._id);

    const formatted = logs.map((log) => ({
      id: log._id,
      action: log.action,
      timestamp: log.timestamp,
      actor: log.actorId
        ? {
            id: log.actorId._id,
            name: log.actorId.name,
            email: log.actorId.email,
          }
        : { name: 'Unknown User' },
      metadata: log.metadata,
      ipAddress: log.ipAddress,
    }));

    res.status(200).json({
      success: true,
      fileId: file._id,
      fileName: file.originalName,
      logs: formatted,
    });
  } catch (err) {
    next(err);
  }
};

const getMyAuditLogs = async (req, res, next) => {
  try {
    let filter = { actorId: req.user._id };
    if (req.user.role === 'admin') {
      filter = {};
    } else {
      const [userFiles, userFolders] = await Promise.all([
        File.find({ ownerId: req.user._id }).select('_id'),
        Folder.find({ ownerId: req.user._id }).select('_id'),
      ]);
      const fileIds = userFiles.map((f) => f._id);
      const folderIds = userFolders.map((f) => f._id);

      filter = {
        $or: [
          { actorId: req.user._id },
          { fileId: { $in: fileIds } },
          { folderId: { $in: folderIds } },
        ],
      };
    }
    const logs = await auditService.getLogs(filter, 100);

    const formatted = logs.map((log) => ({
      id: log._id,
      action: log.action,
      timestamp: log.timestamp,
      file: log.fileId
        ? {
            id: log.fileId._id,
            originalName: log.fileId.originalName,
          }
        : null,
      actor: log.actorId
        ? {
            id: log.actorId._id,
            name: log.actorId.name,
            email: log.actorId.email,
          }
        : null,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
    }));

    res.status(200).json({
      success: true,
      logs: formatted,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getFileAuditLogs,
  getMyAuditLogs,
};
