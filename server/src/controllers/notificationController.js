const Notification = require('../models/Notification');

/**
 * List user notifications
 */
const listNotifications = async (req, res, next) => {
  try {
    const { unreadOnly } = req.query;
    const query = { userId: req.user._id };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        linkToken: n.linkToken,
        fileId: n.fileId,
        folderId: n.folderId,
        accessRequestId: n.accessRequestId,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mark a single notification as read
 */
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mark all user notifications as read
 */
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
};
