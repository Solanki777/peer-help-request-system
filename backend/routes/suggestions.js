const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { Suggestion, SuggestionComment } = require('../models');

const SECRET = 'SECRET_KEY_GTU_2024';

function auth(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'No token' });
    try { req.user = jwt.verify(token, SECRET); next(); }
    catch { res.status(401).json({ message: 'Invalid token' }); }
}

// ── GET ALL SUGGESTIONS (newest first, with comment count) ───────────────────
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.category) filter.category = req.query.category;
        if (req.query.search) {
            const re = new RegExp(req.query.search, 'i');
            filter.$or = [{ title: re }, { content: re }];
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let sortObj = { createdAt: -1 };
        if (req.query.sort === 'popular') sortObj = { votes: -1, createdAt: -1 };

        const total = await Suggestion.countDocuments(filter);
        const suggestions = await Suggestion.find(filter).sort(sortObj).skip(skip).limit(limit);

        // Attach comment count to each suggestion
        const enriched = await Promise.all(suggestions.map(async (s) => {
            const commentCount = await SuggestionComment.countDocuments({ suggestionId: s._id });
            const obj = s.toObject();
            obj.commentCount = commentCount;
            return obj;
        }));

        res.json({ suggestions: enriched, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET SINGLE SUGGESTION ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const s = await Suggestion.findById(req.params.id);
        if (!s) return res.status(404).json({ message: 'Not found' });
        const commentCount = await SuggestionComment.countDocuments({ suggestionId: s._id });
        const obj = s.toObject();
        obj.commentCount = commentCount;
        res.json(obj);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST NEW SUGGESTION ───────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
    try {
        const { title, content, category } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ message: 'Title is required' });
        if (!content || !content.trim()) return res.status(400).json({ message: 'Content is required' });

        const s = new Suggestion({
            userId: req.user.id,
            userName: req.user.name,
            branch: req.user.branch || '',
            title: title.trim(),
            content: content.trim(),
            category: category || 'Other'
        });
        await s.save();

        const io = req.app.get('io');
        io.emit('newSuggestion', s);

        res.json({ message: 'Suggestion posted!', suggestion: s });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── VOTE ON SUGGESTION (toggle — one vote per user) ──────────────────────────
router.put('/:id/vote', auth, async (req, res) => {
    try {
        const s = await Suggestion.findById(req.params.id);
        if (!s) return res.status(404).json({ message: 'Not found' });

        const already = s.votedBy.some(id => id.toString() === req.user.id);
        if (already) {
            // Remove vote (toggle off)
            s.votedBy = s.votedBy.filter(id => id.toString() !== req.user.id);
            s.votes = Math.max(0, s.votes - 1);
        } else {
            s.votedBy.push(req.user.id);
            s.votes += 1;
        }
        await s.save();

        const io = req.app.get('io');
        io.emit('suggestionVote', { id: s._id, votes: s.votes });

        res.json({ votes: s.votes, voted: !already });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE SUGGESTION (owner or admin) ───────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
    try {
        const s = await Suggestion.findById(req.params.id);
        if (!s) return res.status(404).json({ message: 'Not found' });
        if (s.userId.toString() !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ message: 'Not authorized' });

        await SuggestionComment.deleteMany({ suggestionId: req.params.id });
        await Suggestion.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET COMMENTS FOR A SUGGESTION ────────────────────────────────────────────
router.get('/:id/comments', async (req, res) => {
    try {
        const comments = await SuggestionComment.find({ suggestionId: req.params.id })
            .sort({ createdAt: 1 });
        res.json(comments);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST COMMENT ON A SUGGESTION ─────────────────────────────────────────────
router.post('/:id/comments', auth, async (req, res) => {
    try {
        const { content, parentId } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });

        const c = new SuggestionComment({
            suggestionId: req.params.id,
            userId: req.user.id,
            userName: req.user.name,
            content: content.trim(),
            parentId: parentId || null
        });
        await c.save();

        const io = req.app.get('io');
        io.emit('newSuggestionComment', { suggestionId: req.params.id, comment: c });

        res.json({ message: 'Comment posted!', comment: c });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE COMMENT ────────────────────────────────────────────────────────────
router.delete('/comments/:cid', auth, async (req, res) => {
    try {
        const c = await SuggestionComment.findById(req.params.cid);
        if (!c) return res.status(404).json({ message: 'Comment not found' });
        if (c.userId.toString() !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ message: 'Not authorized' });

        await SuggestionComment.deleteMany({ parentId: req.params.cid });
        await SuggestionComment.findByIdAndDelete(req.params.cid);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;