const crypto = require('crypto');
const Folder = require('../models/Folder');
const File = require('../models/File');
const User = require('../models/User');
const FilePermission = require('../models/FilePermission');
const FolderShareLink = require('../models/FolderShareLink');
const storageService = require('../services/storageService');
const auditService = require('../services/auditService');

/**
 * Create a new folder
 */
const createFolder = async (req, res, next) => {
  try {
    const { name = 'Untitled folder', parentId = null, color = '#3b82f6' } = req.body;
    const trimmedName = name.trim() || 'Untitled folder';

    // Verify parent folder if provided
    let parentFolder = null;
    let parentPrefix = `vault/${req.user._id}`;
    if (parentId) {
      parentFolder = await Folder.findOne({
        _id: parentId,
        status: 'active',
        $or: [
          { ownerId: req.user._id },
          { 'sharedWith.userId': req.user._id, 'sharedWith.role': 'editor' },
        ],
      });
      if (!parentFolder) {
        return res.status(404).json({ success: false, error: 'Parent folder not found or write permission denied.' });
      }
      parentPrefix = parentFolder.s3Prefix || `${parentPrefix}/${parentFolder.name}`;
    }

    const s3Prefix = `${parentPrefix}/${trimmedName}`;

    // Create in S3
    await storageService.createFolder(s3Prefix);

    const folder = await Folder.create({
      name: trimmedName,
      ownerId: req.user._id,
      parentId: parentId || null,
      s3Prefix,
      color,
    });

    await auditService.log({
      fileId: null,
      folderId: folder._id,
      actorId: req.user._id,
      action: 'folder_create',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        folderName: folder.name,
        parentId,
        s3Prefix,
        actionDetail: `Created folder "${folder.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Folder created successfully.',
      folder: {
        id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
        color: folder.color,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List folders at a given directory level (parentId)
 */
const listFolders = async (req, res, next) => {
  try {
    const { parentId, shared } = req.query;
    const queryParentId = parentId && parentId !== 'root' && parentId !== 'null' ? parentId : null;

    let folders = [];
    let breadcrumbs = [];

    if (shared === 'true') {
      // Find all folders where user is in sharedWith
      const allSharedFolders = await Folder.find({
        'sharedWith.userId': req.user._id,
        status: 'active',
      }).populate('ownerId', 'name email');

      const sharedFolderIdSet = new Set(allSharedFolders.map((f) => f._id.toString()));

      if (!queryParentId) {
        // Root of "Shared with me": show top-level shared folders
        // Folders whose parent is null or whose parent is not another folder shared with this user
        folders = allSharedFolders.filter(
          (f) => !f.parentId || !sharedFolderIdSet.has(f.parentId.toString())
        );
      } else {
        // Inside a shared folder: show child folders where parentId === queryParentId
        const parentFolder = await Folder.findOne({
          _id: queryParentId,
          status: 'active',
          $or: [{ ownerId: req.user._id }, { 'sharedWith.userId': req.user._id }],
        });

        if (parentFolder) {
          if (parentFolder.ownerId.toString() !== req.user._id.toString()) {
            await auditService.log({
              folderId: parentFolder._id,
              actorId: req.user._id,
              action: 'folder_access',
              ipAddress: req.ip || req.connection.remoteAddress,
              metadata: {
                folderId: parentFolder._id,
                folderName: parentFolder.name,
                actionDetail: `Opened and viewed shared folder "${parentFolder.name}"`,
              },
            });
          }

          folders = await Folder.find({
            parentId: queryParentId,
            status: 'active',
          }).populate('ownerId', 'name email').sort({ name: 1 });
        }
      }
    } else {
      // Owned folders for personal Vault
      folders = await Folder.find({
        ownerId: req.user._id,
        parentId: queryParentId,
        status: 'active',
      }).sort({ name: 1 });
    }

    // Count files and subfolders in each folder
    const folderIds = folders.map((f) => f._id);
    const [fileCounts, subfolderCounts] = await Promise.all([
      File.aggregate([
        { $match: { folderId: { $in: folderIds }, status: 'active' } },
        { $group: { _id: '$folderId', count: { $sum: 1 }, totalSize: { $sum: '$encryptedSize' } } },
      ]),
      Folder.aggregate([
        { $match: { parentId: { $in: folderIds }, status: 'active' } },
        { $group: { _id: '$parentId', count: { $sum: 1 } } },
      ]),
    ]);

    const fileCountMap = fileCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = { count: curr.count, size: curr.totalSize };
      return acc;
    }, {});

    const subfolderCountMap = subfolderCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    // Compute breadcrumbs if parentId is set
    if (queryParentId) {
      let currentId = queryParentId;
      while (currentId) {
        const cur = await Folder.findOne({
          _id: currentId,
          status: 'active',
          $or: [{ ownerId: req.user._id }, { 'sharedWith.userId': req.user._id }],
        });
        if (!cur) break;
        breadcrumbs.unshift({ id: cur._id, name: cur.name });
        currentId = cur.parentId;
      }
    }

    res.status(200).json({
      success: true,
      folders: folders.map((f) => {
        const myPermission = f.sharedWith?.find(
          (sw) => sw.userId && sw.userId.toString() === req.user._id.toString()
        );
        const isOwner = f.ownerId?._id
          ? f.ownerId._id.toString() === req.user._id.toString()
          : f.ownerId?.toString() === req.user._id.toString();

        return {
          id: f._id,
          name: f.name,
          parentId: f.parentId,
          color: f.color,
          itemCount: (fileCountMap[f._id.toString()]?.count || 0) + (subfolderCountMap[f._id.toString()] || 0),
          fileCount: fileCountMap[f._id.toString()]?.count || 0,
          totalSize: fileCountMap[f._id.toString()]?.size || 0,
          isOwner,
          role: myPermission ? myPermission.role : (isOwner ? 'owner' : 'viewer'),
          owner: f.ownerId
            ? {
                id: f.ownerId._id || f.ownerId,
                name: f.ownerId.name || 'Owner',
                email: f.ownerId.email || '',
              }
            : null,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        };
      }),
      breadcrumbs,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Rename a folder (updates DB and syncs in S3)
 */
const renameFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'A valid folder name is required.' });
    }

    const folder = await Folder.findOne({
      _id: id,
      status: 'active',
      $or: [
        { ownerId: req.user._id },
        { 'sharedWith.userId': req.user._id, 'sharedWith.role': 'editor' },
      ],
    });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found or edit permission denied.' });
    }

    const oldName = folder.name;
    const newName = name.trim();
    const oldPrefix = folder.s3Prefix;

    // Calculate new S3 prefix
    let newPrefix = oldPrefix;
    if (oldPrefix) {
      const parts = oldPrefix.split('/');
      parts[parts.length - 1] = newName;
      newPrefix = parts.join('/');
    } else {
      newPrefix = `vault/${req.user._id}/${newName}`;
    }

    // Sync in S3
    if (oldPrefix && oldPrefix !== newPrefix) {
      await storageService.renameFolder(oldPrefix, newPrefix);
    }

    folder.name = newName;
    folder.s3Prefix = newPrefix;
    await folder.save();

    await auditService.log({
      fileId: null,
      actorId: req.user._id,
      action: 'folder_rename',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        oldName,
        newName,
        oldPrefix,
        newPrefix,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Folder renamed successfully.',
      folder: {
        id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
        color: folder.color,
        updatedAt: folder.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a folder (soft-delete folder and subfolders)
 */
const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    // Soft delete this folder
    folder.status = 'deleted';
    await folder.save();

    // Soft delete child files
    await File.updateMany({ folderId: folder._id, status: 'active' }, { status: 'deleted' });

    // Soft delete subfolders
    await Folder.updateMany({ parentId: folder._id, status: 'active' }, { status: 'deleted' });

    await auditService.log({
      fileId: null,
      actorId: req.user._id,
      action: 'folder_delete',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        folderName: folder.name,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Folder and contents moved to Bin.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper to fetch all descendant folder IDs under a given parent folder
 */
const getAllDescendantFolderIds = async (folderId) => {
  const descendantIds = [];
  let currentParentIds = [folderId];
  while (currentParentIds.length > 0) {
    const children = await Folder.find(
      { parentId: { $in: currentParentIds }, status: 'active' },
      '_id'
    );
    if (children.length === 0) break;
    const childIds = children.map((c) => c._id);
    descendantIds.push(...childIds);
    currentParentIds = childIds;
  }
  return descendantIds;
};

/**
 * Securely share a folder with another user (E2EE)
 */
const shareFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetUserId, targetEmail, role = 'viewer', wrappedFileKeys = [] } = req.body;

    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found or you are not the owner.' });
    }

    let targetUser = null;
    if (targetUserId) {
      targetUser = await User.findById(targetUserId);
    } else if (targetEmail) {
      targetUser = await User.findOne({ email: targetEmail.toLowerCase().trim() });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found.' });
    }

    if (targetUser._id.equals(req.user._id)) {
      return res.status(400).json({ success: false, error: 'Cannot share folder with yourself.' });
    }

    // Wrap / grant access to individual files inside this folder (and subfolders)
    if (Array.isArray(wrappedFileKeys) && wrappedFileKeys.length > 0) {
      for (const item of wrappedFileKeys) {
        if (item.fileId && item.wrappedFileKey) {
          await FilePermission.findOneAndUpdate(
            { fileId: item.fileId, userId: targetUser._id },
            {
              role: role === 'editor' ? 'editor' : 'viewer',
              wrappedFileKey: item.wrappedFileKey,
              grantedBy: req.user._id,
              createdAt: new Date(),
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    // Add or update permission entry in folder.sharedWith
    const existingIndex = folder.sharedWith.findIndex((sw) => sw.userId.toString() === targetUser._id.toString());
    if (existingIndex >= 0) {
      folder.sharedWith[existingIndex].role = role;
    } else {
      folder.sharedWith.push({
        userId: targetUser._id,
        role: role === 'editor' ? 'editor' : 'viewer',
        grantedBy: req.user._id,
      });
    }
    await folder.save();

    // Cascade sharing to all descendant subfolders
    const descendantFolderIds = await getAllDescendantFolderIds(folder._id);
    if (descendantFolderIds.length > 0) {
      const subfolders = await Folder.find({ _id: { $in: descendantFolderIds }, status: 'active' });
      for (const sub of subfolders) {
        const subIndex = sub.sharedWith.findIndex((sw) => sw.userId.toString() === targetUser._id.toString());
        if (subIndex >= 0) {
          sub.sharedWith[subIndex].role = role;
        } else {
          sub.sharedWith.push({
            userId: targetUser._id,
            role: role === 'editor' ? 'editor' : 'viewer',
            grantedBy: req.user._id,
          });
        }
        await sub.save();
      }
    }

    await auditService.log({
      fileId: null,
      actorId: req.user._id,
      action: 'folder_share',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        folderName: folder.name,
        targetEmail: targetUser.email,
        targetUserId: targetUser._id,
        role,
        filesSharedCount: wrappedFileKeys.length,
      },
    });

    res.status(200).json({
      success: true,
      message: `Folder "${folder.name}" shared securely with ${targetUser.email}.`,
      folderId: folder._id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List permissions for a folder
 */
const listFolderPermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' })
      .populate('sharedWith.userId', 'name email role avatar')
      .populate('sharedWith.grantedBy', 'name email');

    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    const permissions = (folder.sharedWith || []).map((p) => ({
      userId: p.userId?._id,
      name: p.userId?.name,
      email: p.userId?.email,
      avatar: p.userId?.avatar,
      role: p.role,
      grantedBy: p.grantedBy?.name,
      createdAt: p.createdAt,
    }));

    res.status(200).json({
      success: true,
      permissions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke folder access for a user
 */
const revokeFolderPermission = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    folder.sharedWith = folder.sharedWith.filter((sw) => sw.userId.toString() !== userId);
    await folder.save();

    // Cascade revocation to all descendant subfolders
    const descendantFolderIds = await getAllDescendantFolderIds(folder._id);
    if (descendantFolderIds.length > 0) {
      await Folder.updateMany(
        { _id: { $in: descendantFolderIds } },
        { $pull: { sharedWith: { userId } } }
      );
    }

    // Find all files in this folder and descendant subfolders and remove their permissions for this user
    const allFolderIds = [folder._id, ...descendantFolderIds];
    const folderFiles = await File.find({ folderId: { $in: allFolderIds } });
    const fileIds = folderFiles.map((f) => f._id);
    if (fileIds.length > 0) {
      await FilePermission.deleteMany({ fileId: { $in: fileIds }, userId });
    }

    await auditService.log({
      fileId: null,
      actorId: req.user._id,
      action: 'folder_revoke_share',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        folderName: folder.name,
        revokedUserId: userId,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Access to folder revoked successfully.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Create shareable link for folder
 */
const createFolderShareLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role = 'viewer', expiresHours, maxAccessCount } = req.body;

    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    let expiresAt = null;
    if (expiresHours && Number(expiresHours) > 0) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + Number(expiresHours));
    }

    const shareLink = await FolderShareLink.create({
      folderId: folder._id,
      token,
      createdBy: req.user._id,
      role: role === 'editor' ? 'editor' : 'viewer',
      expiresAt,
      maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null,
    });

    await auditService.log({
      fileId: null,
      actorId: req.user._id,
      action: 'folder_share_link',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderId: folder._id,
        folderName: folder.name,
        role: shareLink.role,
        tokenId: shareLink._id,
        expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Folder shareable link created.',
      shareLink: {
        id: shareLink._id,
        token: shareLink.token,
        role: shareLink.role,
        expiresAt: shareLink.expiresAt,
        maxAccessCount: shareLink.maxAccessCount,
        accessCount: shareLink.accessCount,
        createdAt: shareLink.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List shareable links for folder
 */
const listFolderShareLinks = async (req, res, next) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    const links = await FolderShareLink.find({ folderId: folder._id, isRevoked: false }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      links: links.map((l) => ({
        id: l._id,
        token: l.token,
        role: l.role || 'viewer',
        expiresAt: l.expiresAt,
        maxAccessCount: l.maxAccessCount,
        accessCount: l.accessCount,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke folder shareable link
 */
const revokeFolderShareLink = async (req, res, next) => {
  try {
    const { id, linkId } = req.params;
    const link = await FolderShareLink.findOneAndUpdate(
      { _id: linkId, folderId: id, createdBy: req.user._id },
      { isRevoked: true },
      { new: true }
    );

    if (!link) {
      return res.status(404).json({ success: false, error: 'Share link not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Folder shareable link revoked.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get audit and access history for a specific folder
 */
const getFolderAuditLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findOne({
      _id: id,
      status: 'active',
      $or: [{ ownerId: req.user._id }, { 'sharedWith.userId': req.user._id }],
    });

    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found or access denied.' });
    }

    const logs = await auditService.getFolderLogs(folder._id);

    const formatted = logs.map((log) => ({
      id: log._id,
      action: log.action,
      timestamp: log.timestamp,
      actor: log.actorId
        ? {
            id: log.actorId._id,
            name: log.actorId.name,
            email: log.actorId.email,
            avatar: log.actorId.avatar,
          }
        : { name: 'Unknown User' },
      metadata: log.metadata,
      ipAddress: log.ipAddress,
    }));

    res.status(200).json({
      success: true,
      folderId: folder._id,
      folderName: folder.name,
      logs: formatted,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  shareFolder,
  listFolderPermissions,
  revokeFolderPermission,
  createFolderShareLink,
  listFolderShareLinks,
  revokeFolderShareLink,
  getFolderAuditLogs,
};

