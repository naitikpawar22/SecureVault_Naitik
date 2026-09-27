const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      default: null,
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor ID is required'],
      index: true,
    },
    action: {
      type: String,
      enum: [
        'upload',
        'download',
        'preview',
        'share',
        'revoke',
        'delete',
        'login',
        'logout',
        'register',
        'security_alert',
        'edit',
        'file_rename',
        'folder_create',
        'folder_rename',
        'folder_delete',
        'folder_share',
        'folder_revoke_share',
        'folder_access',
      ],
      required: [true, 'Action is required'],
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    metadata: {
      // Safe, non-secret audit metadata (e.g. file originalName, targetUserEmail, clientBrowser)
      // STRICT RULE: Never store passwords, tokens, file contents, or raw encryption keys here.
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: false,
  }
);

// Indexes for fast retrieval by file, folder, actor, and chronological ordering
auditLogSchema.index({ fileId: 1, timestamp: -1 });
auditLogSchema.index({ folderId: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
