const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const SECRET = 'SECRET_KEY_GTU_2024';

// ── REQUEST MODEL ─────────────────────────────────────────────────────────────
const RequestSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  subject:     { type: String, required: true },
  audience:    { type: String, default: 'General' },
  tags:        { type: [String], default: [] },         // NEW: tag system
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:    { type: String },
  branch:      { type: String },
  answersCount:{ type: Number, default: 0 },            // NEW: count cache
  createdAt:   { type: Date, default: Date.now }
});
const Request = mongoose.model('Request', RequestSchema);

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// ── GET ALL REQUESTS (with search, filter, pagination) ───────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};

    // Subject filter
    if (req.query.subject) filter.subject = req.query.subject;

    // Audience filter (branch-based)
    if (req.query.branch) {
      filter.$or = [
        { audience: 'General' },
        { audience: req.query.branch }
      ];
    }

    // Tag filter
    if (req.query.tag) filter.tags = req.query.tag;

    // SEARCH: search in title and description
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i'); // case-insensitive
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }

    // PAGINATION: default 10 per page
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const total    = await Request.countDocuments(filter);
    const requests = await Request.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      requests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET SINGLE REQUEST ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CREATE REQUEST ────────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, subject, audience, tags } = req.body;

    // Parse tags: "DSA, DBMS, OS" → ['DSA','DBMS','OS']
    const parsedTags = tags
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const request = new Request({
      title, description, subject, audience,
      tags:     parsedTags,
      userId:   req.user.id,
      userName: req.user.name,
      branch:   req.user.branch
    });
    await request.save();

    // Award reputation points for posting a question
    const User = require('./auth').User;
    await User.findByIdAndUpdate(req.user.id, { $inc: { reputation: 2 } });

    // Real-time: notify all connected users
    const io = req.app.get('io');
    io.emit('newRequest', request);

    res.json({ message: 'Request created!', request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE REQUEST ────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found' });

    // Only owner OR admin can delete
    if (request.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Request.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;