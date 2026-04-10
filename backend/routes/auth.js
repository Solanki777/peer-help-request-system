const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

// FIX: Use central models — no duplicate schema definition here
const { User } = require('../models');

const SECRET = 'SECRET_KEY_GTU_2024';

// ── REGISTER ──────────────────────────────────────────────────────────────────
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
    const user   = new User({ name, email, password: hashed, branch });
    await user.save();
    res.json({ message: 'Registration successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Wrong password' });

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, branch: user.branch, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, branch: user.branch, role: user.role, reputation: user.reputation }
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ reputation: -1 }).limit(10);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── UPDATE PROFILE ───────────────────────────────────────────────────────────
router.put('/profile/:id', async (req, res) => {
  try {
    const { name, branch, skills } = req.body;

    // Basic auth — only the profile owner can update (check via token if provided)
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'No token' });

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, SECRET);
    if (decoded.id !== req.params.id)
      return res.status(403).json({ message: 'You can only edit your own profile' });

    const updates = {};
    if (name   && name.trim())   updates.name   = name.trim();
    if (branch !== undefined)    updates.branch = branch;
    if (skills !== undefined)    updates.skills = Array.isArray(skills)
      ? skills
      : skills.split(',').map(s => s.trim()).filter(Boolean);

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Profile updated!', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET ANSWERS BY USER (for profile page) ────────────────────────────────────
router.get('/my-answers/:userId', async (req, res) => {
  try {
    const { Answer, Request } = require('../models');
    // Get all answers by this user, populate the parent question info
    const answers = await Answer.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });

    // Attach question title + subject to each answer so profile can display it
    const enriched = await Promise.all(answers.map(async (a) => {
      const req2 = await Request.findById(a.requestId).select('title subject');
      return {
        _id:          a._id,
        content:      a.content,
        votes:        a.votes,
        isBest:       a.isBest,
        createdAt:    a.createdAt,
        requestId:    a.requestId,
        requestTitle: req2 ? req2.title   : '(deleted question)',
        requestSubject: req2 ? req2.subject : ''
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports        = router;
module.exports.User   = User;   // named export so other routes can do require('./auth').User