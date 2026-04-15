const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { Answer, Request, User, Notification, Comment } = require('../models');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

const authMiddleware = require('../middleware/auth');

// GET answers for a request
router.get('/:requestId', async (req, res) => {
  try {
    const answers = await Answer.find({ requestId: req.params.requestId, isHidden: { $ne: true } })
      .sort({ isBest: -1, votes: -1 });
    res.json(answers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST new answer
router.post('/:requestId', authMiddleware, async (req, res) => {
  try {
    if (!req.body.content || !req.body.content.trim())
      return res.status(400).json({ message: 'Answer content cannot be empty' });

    const answer = new Answer({
      requestId: req.params.requestId,
      userId: req.user.id,
      userName: req.user.name,
      content: req.body.content.trim()
    });
    await answer.save();
    // answersCount increment handled by AnswerSchema.post('save') in models.js

    await User.findByIdAndUpdate(req.user.id, { $inc: { reputation: 10 } });

    const request = await Request.findById(req.params.requestId);
    if (request && request.userId.toString() !== req.user.id) {
      const notif = new Notification({
        userId: request.userId,
        type: 'new_answer',
        message: `${req.user.name} answered your question: "${request.title}"`,
        link: `/#!/request/${req.params.requestId}`
      });
      await notif.save();
      req.app.get('io').to(request.userId.toString()).emit('notification', notif);
    }

    req.app.get('io').emit('newAnswer', { requestId: req.params.requestId, answer });
    res.json({ message: 'Answer posted!', answer });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT upvote/downvote
router.put('/:id/vote', authMiddleware, async (req, res) => {
  try {
    const { type } = req.body;
    if (!['up', 'down'].includes(type))
      return res.status(400).json({ message: 'Invalid vote type' });

    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    if (answer.userId.toString() === req.user.id)
      return res.status(403).json({ message: 'You cannot vote on your own answer' });

    const existingVote = answer.votedBy.find(v => v.userId.toString() === req.user.id);
    if (existingVote) {
      if (existingVote.vote === type)
        return res.status(400).json({ message: 'You already ' + type + 'voted this answer' });
      const reversal = existingVote.vote === 'up' ? -1 : 1;
      answer.votes += reversal;
      existingVote.vote = type;
    } else {
      answer.votedBy.push({ userId: req.user.id, vote: type });
    }

    answer.votes += type === 'up' ? 1 : -1;
    await answer.save();

    const repChange = type === 'up' ? 5 : -2;
    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: repChange } });

    req.app.get('io').emit('voteUpdate', { answerId: req.params.id, votes: answer.votes });
    res.json(answer);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT mark best answer
router.put('/:id/best', authMiddleware, async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    // Verify the requester owns the question
    const request = await Request.findById(answer.requestId);
    if (!request) return res.status(404).json({ message: 'Question not found' });
    if (request.userId.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Only the question author can mark best answer' });

    await Answer.updateMany({ requestId: answer.requestId }, { isBest: false });
    const updated = await Answer.findByIdAndUpdate(req.params.id, { isBest: true }, { new: true });

    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 50 } });

    if (answer.userId.toString() !== req.user.id) {
      const notif = new Notification({
        userId: answer.userId,
        type: 'best_answer',
        message: `Your answer was marked as best by ${req.user.name}! +50 points`,
        link: `/#!/request/${answer.requestId}`
      });
      await notif.save();
      req.app.get('io').to(answer.userId.toString()).emit('notification', notif);
    }
    res.json({ message: 'Best answer marked!', answer: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE answer — BUG FIX: also deletes all comments on this answer
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    if (answer.userId.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You can only delete your own answers' });

    // BUG FIX: cascade-delete all comments belonging to this answer
    await Comment.deleteMany({ answerId: req.params.id });
    await Answer.findByIdAndDelete(req.params.id);

    await Request.findByIdAndUpdate(answer.requestId, { $inc: { answersCount: -1 } });

    res.json({ message: 'Answer and its comments deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;