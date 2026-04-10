const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');

// FIX: Use central models — no duplicate schema definition here
const { Answer, Request, User, Notification } = require('../models');

const SECRET = 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
}

// GET answers for a request
router.get('/:requestId', async (req, res) => {
  try {
    const answers = await Answer.find({ requestId: req.params.requestId })
      .sort({ isBest: -1, votes: -1 });
    res.json(answers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST new answer
router.post('/:requestId', authMiddleware, async (req, res) => {
  try {
    // FIX: userId and userName always from token — never from client body
    const answer = new Answer({
      requestId: req.params.requestId,
      userId:    req.user.id,    // always from token
      userName:  req.user.name,  // always from token
      content:   req.body.content
    });
    await answer.save();
    // Note: answersCount increment handled by AnswerSchema.post('save') middleware in models.js

    await User.findByIdAndUpdate(req.user.id, { $inc: { reputation: 10 } });

    const request = await Request.findById(req.params.requestId);

    if (request && request.userId.toString() !== req.user.id) {
      const notif = new Notification({
        userId:  request.userId,
        type:    'new_answer',
        message: `${req.user.name} answered your question: "${request.title}"`,
        link:    `/#!/request/${req.params.requestId}`
      });
      await notif.save();
      const io = req.app.get('io');
      io.to(request.userId.toString()).emit('notification', notif);
    }

    const io = req.app.get('io');
    io.emit('newAnswer', { requestId: req.params.requestId, answer });

    res.json({ message: 'Answer posted!', answer });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT upvote/downvote — prevents self-voting and duplicate votes
router.put('/:id/vote', authMiddleware, async (req, res) => {
  try {
    const { type } = req.body;
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    // Prevent voting on your own answer
    if (answer.userId.toString() === req.user.id)
      return res.status(403).json({ message: 'You cannot vote on your own answer' });

    // Check if already voted
    const existingVote = answer.votedBy.find(v => v.userId.toString() === req.user.id);
    if (existingVote) {
      if (existingVote.vote === type)
        return res.status(400).json({ message: 'You already ' + type + 'voted this answer' });
      // Switching vote (up→down or down→up): reverse the old vote first
      const reversal = existingVote.vote === 'up' ? -1 : 1;
      answer.votes += reversal;
      existingVote.vote = type;
    } else {
      answer.votedBy.push({ userId: req.user.id, vote: type });
    }

    answer.votes += type === 'up' ? 1 : -1;
    await answer.save();

    // Reputation: +5 for upvote on answer author, -2 for downvote
    const repChange = type === 'up' ? 5 : -2;
    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: repChange } });

    const io = req.app.get('io');
    io.emit('voteUpdate', { answerId: req.params.id, votes: answer.votes });
    res.json(answer);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT mark best answer
router.put('/:id/best', authMiddleware, async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    // Clear isBest on all answers for this request
    await Answer.updateMany({ requestId: answer.requestId }, { isBest: false });

    // FIX: Use findByIdAndUpdate (not answer.save()) so the post('save') hook
    // does NOT fire — otherwise answersCount would be incremented again wrongly
    const updated = await Answer.findByIdAndUpdate(
      req.params.id,
      { isBest: true },
      { new: true }
    );

    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 50 } });

    if (answer.userId.toString() !== req.user.id) {
      const notif = new Notification({
        userId:  answer.userId,
        type:    'best_answer',
        message: `Your answer was marked as best by ${req.user.name}! +50 points`,
        link:    `/#!/request/${answer.requestId}`
      });
      await notif.save();
      const io = req.app.get('io');
      io.to(answer.userId.toString()).emit('notification', notif);
    }
    res.json({ message: 'Best answer marked!', answer: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE answer
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Answer not found' });

    if (answer.userId.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You can only delete your own answers' });

    await Answer.findByIdAndDelete(req.params.id);

    // Decrement answersCount on the parent request so the count stays accurate
    await Request.findByIdAndUpdate(
      answer.requestId,
      { $inc: { answersCount: -1 } }
    );

    res.json({ message: 'Answer deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;