const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

const SECRET = 'SECRET_KEY_GTU_2024';

// ── USER MODEL ────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true },
  password:   { type: String, required: true },
  branch:     { type: String, default: '' },
  skills:     { type: [String], default: [] },
  reputation: { type: Number, default: 0 },
  role:       { type: String, enum: ['student', 'admin'], default: 'student' },
  createdAt:  { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);
module.exports.User = User;

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, branch } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, branch });
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        branch: user.branch,
        role: user.role,
        reputation: user.reputation
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── GET USER PROFILE ──────────────────────────────────────────────────────────
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET LEADERBOARD ───────────────────────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ reputation: -1 })
      .limit(10);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;