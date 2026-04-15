const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// FIX: Use central models — no duplicate schema definition here
const { Notification } = require('../models');

const SECRET = 'SECRET_KEY_GTU_2024';

module.exports.Notification = Notification; // keep for cross-route imports

const authMiddleware = require('../middleware/auth');

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 }).limit(20);
    res.json(notifs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.id, isRead: false });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id }, { isRead: true });
    res.json({ message: 'All marked as read' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;