const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { User, Answer, Request } = require('../models');
const SECRET = 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
}

// ── REGISTER — saves as pending, waits for admin approval ─────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, branch } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    await new User({ name, email, password: hashed, branch: branch || '', status: 'pending' }).save();

    res.json({ message: 'Registration submitted! An admin will review and approve your account. You will be notified.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── LOGIN — blocks pending/rejected students ───────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'No account found with this email' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Incorrect password' });

    // Only admins bypass approval gate
    if (user.role !== 'admin') {
      if (user.status === 'pending')
        return res.status(403).json({ message: '⏳ Your account is pending admin approval. Please wait.' });
      if (user.status === 'rejected')
        return res.status(403).json({ message: '❌ Your account was rejected. Please contact admin.' });
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, branch: user.branch, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        branch: user.branch, role: user.role, reputation: user.reputation,
        status: user.status
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── GET PROFILE ───────────────────────────────────────────────────────────────
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── UPDATE OWN PROFILE (student self-edit) ────────────────────────────────────
router.put('/profile/:id', authMiddleware, async (req, res) => {
  try {
    // Only the profile owner can self-edit (admin edits go through /api/admin/users/:id)
    if (req.user.id !== req.params.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You can only edit your own profile' });

    const { name, branch, skills } = req.body;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (branch !== undefined) updates.branch = branch;
    if (skills !== undefined) updates.skills = Array.isArray(skills)
      ? skills : skills.split(',').map(s => s.trim()).filter(Boolean);

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile updated!', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ status: 'approved' })
      .select('-password').sort({ reputation: -1 }).limit(10);
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── MY ANSWERS (for profile page) ─────────────────────────────────────────────
router.get('/my-answers/:userId', async (req, res) => {
  try {
    const answers = await Answer.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    const enriched = await Promise.all(answers.map(async (a) => {
      const q = await Request.findById(a.requestId).select('title subject');
      return {
        _id: a._id,
        content: a.content,
        votes: a.votes,
        isBest: a.isBest,
        createdAt: a.createdAt,
        requestId: a.requestId,
        requestTitle: q ? q.title : '(deleted)',
        requestSubject: q ? q.subject : ''
      };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
module.exports.User = User;