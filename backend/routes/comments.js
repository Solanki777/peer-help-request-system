const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');

const { Comment, Answer, Notification } = require('../models');

const SECRET = 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
}

// GET all comments for an answer (flat list, sorted oldest first)
router.get('/:answerId', async (req, res) => {
  try {
    const comments = await Comment.find({ answerId: req.params.answerId })
      .sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST a new comment on an answer
router.post('/:answerId', authMiddleware, async (req, res) => {
  try {
    const { content, parentId } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: 'Comment cannot be empty' });

    const comment = new Comment({
      answerId: req.params.answerId,
      userId:   req.user.id,
      userName: req.user.name,
      content:  content.trim(),
      parentId: parentId || null
    });
    await comment.save();

    // Notify the answer author (if different from commenter)
    const answer = await Answer.findById(req.params.answerId);
    if (answer && answer.userId.toString() !== req.user.id) {
      const notif = new Notification({
        userId:  answer.userId,
        type:    'comment',
        message: `${req.user.name} commented on your answer`,
        link:    `/#!/request/${answer.requestId}`
      });
      await notif.save();
      const io = req.app.get('io');
      io.to(answer.userId.toString()).emit('notification', notif);
    }

    // Real-time: broadcast the new comment to everyone viewing this answer's request
    const io = req.app.get('io');
    if (answer) {
      io.emit('newComment', { answerId: req.params.answerId, comment });
    }

    res.json({ message: 'Comment posted!', comment });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE a comment (owner or admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.userId.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });

    // Also delete any replies to this comment
    await Comment.deleteMany({ parentId: req.params.id });
    await Comment.findByIdAndDelete(req.params.id);

    res.json({ message: 'Comment deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;