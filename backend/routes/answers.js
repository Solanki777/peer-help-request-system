const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const SECRET = 'SECRET_KEY_GTU_2024';

const AnswerSchema = new mongoose.Schema({
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    content: { type: String, required: true },
    votes: { type: Number, default: 0 },
    isBest: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Answer = mongoose.model('Answer', AnswerSchema);

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
            .sort({ isBest: -1, votes: -1 }); // Best answer first, then by votes
        res.json(answers);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST new answer
router.post('/:requestId', authMiddleware, async (req, res) => {
    try {
        const answer = new Answer({
            requestId: req.params.requestId,
            userId: req.user.id,
            userName: req.user.name,
            content: req.body.content
        });
        await answer.save();

        // Update answers count on the request
        const mongoose = require('mongoose');
        await mongoose.model('Request').findByIdAndUpdate(
            req.params.requestId,
            { $inc: { answersCount: 1 } }
        );

        // Award reputation +10 for posting answer
        const User = require('./auth').User;
        await User.findByIdAndUpdate(req.user.id, { $inc: { reputation: 10 } });

        // Get the request to find who to notify
        const request = await mongoose.model('Request').findById(req.params.requestId);

        // Create notification for question owner
        const Notification = require('./notifications').Notification;
        if (request && request.userId.toString() !== req.user.id) {
            const notif = new Notification({
                userId: request.userId,
                type: 'new_answer',
                message: `${req.user.name} answered your question: "${request.title}"`,
                link: `/#!/request/${req.params.requestId}`
            });
            await notif.save();

            // Real-time notification to question owner
            const io = req.app.get('io');
            io.to(request.userId.toString()).emit('notification', notif);
        }

        // Real-time: broadcast new answer to all users viewing this request
        const io = req.app.get('io');
        io.emit('newAnswer', { requestId: req.params.requestId, answer });

        res.json({ message: 'Answer posted!', answer });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT upvote/downvote
router.put('/:id/vote', authMiddleware, async (req, res) => {
    try {
        const { type } = req.body;
        const change = type === 'up' ? 1 : -1;
        const answer = await Answer.findByIdAndUpdate(
            req.params.id,
            { $inc: { votes: change } },
            { new: true }
        );

        // Award reputation +5 to answer author for upvote
        if (type === 'up') {
            const User = require('./auth').User;
            await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 5 } });
        }

        const io = req.app.get('io');
        io.emit('voteUpdate', { answerId: req.params.id, votes: answer.votes });

        res.json(answer);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT mark best answer
router.put('/:id/best', authMiddleware, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.id);
        await Answer.updateMany({ requestId: answer.requestId }, { isBest: false });
        answer.isBest = true;
        await answer.save();

        // Award reputation +50 to answer author
        const User = require('./auth').User;
        await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 50 } });

        // Notify the answer author
        const Notification = require('./notifications').Notification;
        if (answer.userId.toString() !== req.user.id) {
            const notif = new Notification({
                userId: answer.userId,
                type: 'best_answer',
                message: `Your answer was marked as best by ${req.user.name}! +50 points`,
                link: `/#!/request/${answer.requestId}`
            });
            await notif.save();

            const io = req.app.get('io');
            io.to(answer.userId.toString()).emit('notification', notif);
        }

        res.json({ message: 'Best answer marked!', answer });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE answer
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.id);
        if (!answer) return res.status(404).json({ message: 'Answer not found' });

        if (answer.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'You can only delete your own answers' });
        }

        await Answer.findByIdAndDelete(req.params.id);
        res.json({ message: 'Answer deleted successfully' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;