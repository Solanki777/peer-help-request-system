const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { User, Request, Answer, Comment, Suggestion, SuggestionComment, Notification } = require('../models');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'No token' });
    try { req.user = jwt.verify(token, SECRET); next(); }
    catch { res.status(401).json({ message: 'Invalid token' }); }
}
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Admin access only' });
    next();
}
const G = [auth, adminOnly];

// ══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

router.get('/users', ...G, async (req, res) => {
    try {
        const filter = { role: 'student' };
        if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
        if (req.query.branch) filter.branch = req.query.branch;
        if (req.query.search) {
            const re = new RegExp(req.query.search, 'i');
            filter.$or = [{ name: re }, { email: re }];
        }

        const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
        const pending = await User.countDocuments({ role: 'student', status: 'pending' });
        const approved = await User.countDocuments({ role: 'student', status: 'approved' });
        const rejected = await User.countDocuments({ role: 'student', status: 'rejected' });

        res.json({ users, counts: { pending, approved, rejected, total: pending + approved + rejected } });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/users/:id', ...G, async (req, res) => {
    try {
        const allowed = [
            'status', 'role', 'name', 'enrollment', 'contact', 'dob',
            'department', 'branch', 'semester', 'city', 'bio', 'interests',
            'skills', 'reputation'
        ];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

        if (updates.skills && typeof updates.skills === 'string')
            updates.skills = updates.skills.split(',').map(s => s.trim()).filter(Boolean);
        if (updates.reputation !== undefined)
            updates.reputation = parseInt(updates.reputation) || 0;
        if (updates.semester !== undefined)
            updates.semester = parseInt(updates.semester) || null;
        if (updates.dob) updates.dob = new Date(updates.dob);

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (req.body.status === 'approved' || req.body.status === 'rejected') {
            const msgs = {
                approved: '✅ Your account has been approved! You can now log in to PeerHelp GTU.',
                rejected: '❌ Your account was not approved. Please contact admin for more information.'
            };
            const notif = new Notification({
                userId: user._id,
                type: 'account_status',
                message: msgs[req.body.status],
                link: '/#!/login'
            });
            await notif.save();
            req.app.get('io').to(user._id.toString()).emit('notification', notif);
        }

        res.json({ message: 'User updated successfully', user });
    } catch (err) { res.status(500).json({ message: err.message }); }
});
router.delete('/questions/:id', ...G, async (req, res) => {
    try {
        const deleted = await Request.findById(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Question not found' });

        // Find all answers for this question
        const answers = await Answer.find({ requestId: req.params.id }).select('_id');
        const ids = answers.map(a => a._id);

        // Cascade: delete all comments on those answers
        if (ids.length > 0) {
            await Comment.deleteMany({ answerId: { $in: ids } });
            await Answer.deleteMany({ requestId: req.params.id });
        }

        // Finally delete the question itself
        await Request.findByIdAndDelete(req.params.id);

        res.json({ message: `Question and ${ids.length} answer(s) with all comments deleted successfully` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// QUESTION MODERATION  (includes pending approval queue)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/questions', ...G, async (req, res) => {
    try {
        const filter = {};
        if (req.query.subject) filter.subject = req.query.subject;
        if (req.query.status) filter.status = req.query.status;   // pending|approved|rejected
        if (req.query.hidden === 'true') filter.isHidden = true;
        if (req.query.hidden === 'false') filter.isHidden = false;
        if (req.query.search) {
            const re = new RegExp(req.query.search, 'i');
            filter.$or = [{ title: re }, { description: re }, { userName: re }];
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;
        const total = await Request.countDocuments(filter);
        const questions = await Request.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

        // Count pending questions for badge
        const pendingCount = await Request.countDocuments({ status: 'pending' });

        res.json({ questions, total, totalPages: Math.ceil(total / limit), pendingCount });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── APPROVE / REJECT a question ───────────────────────────────────────────────
router.put('/questions/:id/approve', ...G, async (req, res) => {
    try {
        const q = await Request.findByIdAndUpdate(
            req.params.id, { status: 'approved' }, { new: true }
        );
        if (!q) return res.status(404).json({ message: 'Question not found' });

        // Give reputation to the author
        await User.findByIdAndUpdate(q.userId, { $inc: { reputation: 2 } });

        // Notify the author
        const notif = new Notification({
            userId: q.userId,
            type: 'question_approved',
            message: `✅ Your question "${q.title}" has been approved and is now visible to everyone!`,
            link: `/#!/request/${q._id}`
        });
        await notif.save();
        req.app.get('io').to(q.userId.toString()).emit('notification', notif);
        req.app.get('io').emit('newRequest', q);

        res.json({ message: 'Question approved', question: q });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/questions/:id/reject', ...G, async (req, res) => {
    try {
        const q = await Request.findByIdAndUpdate(
            req.params.id, { status: 'rejected' }, { new: true }
        );
        if (!q) return res.status(404).json({ message: 'Question not found' });

        const notif = new Notification({
            userId: q.userId,
            type: 'question_rejected',
            message: `❌ Your question "${q.title}" was not approved by the admin.`,
            link: '/#!/dashboard'
        });
        await notif.save();
        req.app.get('io').to(q.userId.toString()).emit('notification', notif);

        res.json({ message: 'Question rejected', question: q });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/questions/:id/hide', ...G, async (req, res) => {
    try {
        const q = await Request.findByIdAndUpdate(req.params.id, { isHidden: req.body.hide }, { new: true });
        if (!q) return res.status(404).json({ message: 'Question not found' });
        res.json({ message: req.body.hide ? 'Question hidden' : 'Question restored', question: q });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/questions/:id', ...G, async (req, res) => {
    try {
        const answers = await Answer.find({ requestId: req.params.id }).select('_id');
        const ids = answers.map(a => a._id);
        if (ids.length > 0) {
            await Comment.deleteMany({ answerId: { $in: ids } });
        }
        await Answer.deleteMany({ requestId: req.params.id });
        const deleted = await Request.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Question not found' });
        res.json({ message: `Question deleted along with ${ids.length} answer(s) and their comments` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── ANSWER MODERATION ─────────────────────────────────────────────────────────
router.get('/questions/:id/answers', ...G, async (req, res) => {
    try {
        const answers = await Answer.find({ requestId: req.params.id }).sort({ createdAt: -1 });
        res.json(answers);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/answers/:id/hide', ...G, async (req, res) => {
    try {
        const a = await Answer.findByIdAndUpdate(req.params.id, { isHidden: req.body.hide }, { new: true });
        if (!a) return res.status(404).json({ message: 'Answer not found' });
        res.json({ message: req.body.hide ? 'Answer hidden' : 'Answer restored', answer: a });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/answers/:id', ...G, async (req, res) => {
    try {
        const a = await Answer.findById(req.params.id);
        if (!a) return res.status(404).json({ message: 'Answer not found' });
        await Comment.deleteMany({ answerId: req.params.id });
        await Answer.findByIdAndDelete(req.params.id);
        await Request.findByIdAndUpdate(a.requestId, { $inc: { answersCount: -1 } });
        res.json({ message: 'Answer and its comments deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SUGGESTION MANAGEMENT  (includes pending approval queue)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/suggestions', ...G, async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.search) {
            const re = new RegExp(req.query.search, 'i');
            filter.$or = [{ title: re }, { content: re }, { userName: re }];
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;
        const total = await Suggestion.countDocuments(filter);
        const suggestions = await Suggestion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

        // Count pending suggestions for badge
        const pendingCount = await Suggestion.countDocuments({ status: 'pending' });

        res.json({ suggestions, total, totalPages: Math.ceil(total / limit), pendingCount });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── APPROVE / REJECT a suggestion ────────────────────────────────────────────
router.put('/suggestions/:id/approve', ...G, async (req, res) => {
    try {
        const s = await Suggestion.findByIdAndUpdate(
            req.params.id, { status: 'approved' }, { new: true }
        );
        if (!s) return res.status(404).json({ message: 'Suggestion not found' });

        const notif = new Notification({
            userId: s.userId,
            type: 'suggestion_approved',
            message: `✅ Your suggestion "${s.title}" has been approved and is now visible!`,
            link: '/#!/suggestions'
        });
        await notif.save();
        req.app.get('io').to(s.userId.toString()).emit('notification', notif);

        res.json({ message: 'Suggestion approved', suggestion: s });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/suggestions/:id/reject', ...G, async (req, res) => {
    try {
        const { adminNote } = req.body;
        const s = await Suggestion.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected', adminNote: adminNote || '' },
            { new: true }
        );
        if (!s) return res.status(404).json({ message: 'Suggestion not found' });

        const notif = new Notification({
            userId: s.userId,
            type: 'suggestion_rejected',
            message: `❌ Your suggestion "${s.title}" was not approved${adminNote ? ': ' + adminNote : '.'}`,
            link: '/#!/suggestions'
        });
        await notif.save();
        req.app.get('io').to(s.userId.toString()).emit('notification', notif);

        res.json({ message: 'Suggestion rejected', suggestion: s });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Keep old status endpoint for backward compat (admin note etc.)
router.put('/suggestions/:id/status', ...G, async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        const valid = ['Open', 'Accepted', 'In Progress', 'Rejected', 'pending', 'approved', 'rejected'];
        if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

        const s = await Suggestion.findByIdAndUpdate(
            req.params.id,
            { status, adminNote: adminNote || '' },
            { new: true }
        );
        if (!s) return res.status(404).json({ message: 'Suggestion not found' });
        res.json({ message: 'Status updated', suggestion: s });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/analytics', ...G, async (req, res) => {
    try {
        const totalStudents = await User.countDocuments({ role: 'student' });
        const pendingStudents = await User.countDocuments({ role: 'student', status: 'pending' });
        const approvedStudents = await User.countDocuments({ role: 'student', status: 'approved' });
        const rejectedStudents = await User.countDocuments({ role: 'student', status: 'rejected' });
        const totalQuestions = await Request.countDocuments();
        const pendingQuestions = await Request.countDocuments({ status: 'pending' });
        const approvedQuestions = await Request.countDocuments({ status: 'approved' });
        const hiddenQuestions = await Request.countDocuments({ isHidden: true });
        const answeredQuestions = await Request.countDocuments({ answersCount: { $gt: 0 } });
        const totalAnswers = await Answer.countDocuments();
        const totalComments = await Comment.countDocuments();
        const totalSuggestions = await Suggestion.countDocuments();
        const pendingSuggestions = await Suggestion.countDocuments({ status: 'pending' });
        const approvedSuggestions = await Suggestion.countDocuments({ status: 'approved' });

        const bySubject = await Request.aggregate([
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const usersByBranch = await User.aggregate([
            { $match: { role: 'student', status: 'approved' } },
            { $group: { _id: '$branch', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const topUsers = await User.find({ role: 'student' })
            .select('name branch reputation status')
            .sort({ reputation: -1 })
            .limit(5);

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activityByDay = await Request.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            users: { total: totalStudents, pending: pendingStudents, approved: approvedStudents, rejected: rejectedStudents },
            questions: { total: totalQuestions, pending: pendingQuestions, approved: approvedQuestions, hidden: hiddenQuestions, answered: answeredQuestions },
            answers: { total: totalAnswers },
            comments: { total: totalComments },
            suggestions: { total: totalSuggestions, pending: pendingSuggestions, approved: approvedSuggestions },
            bySubject, usersByBranch, topUsers, activityByDay
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;