const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const SECRET = 'SECRET_KEY_GTU_2024';

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String },  // 'new_answer', 'best_answer', 'upvote'
    message: { type: String },
    link: { type: String },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', NotificationSchema);
module.exports.Notification = Notification;

function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'No token' });
    try { req.user = jwt.verify(token, SECRET); next(); }
    catch { res.status(401).json({ message: 'Invalid token' }); }
}

// GET my notifications
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const notifs = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(notifs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET unread count
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ userId: req.user.id, isRead: false });
        res.json({ count });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT mark all as read
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.id }, { isRead: true });
        res.json({ message: 'All marked as read' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;