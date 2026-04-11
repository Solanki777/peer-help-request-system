const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { Request, User, Answer, Comment } = require('../models');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
}

// ── GET ALL REQUESTS ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = { isHidden: { $ne: true } };

    if (req.query.subject) filter.subject = req.query.subject;

    if (req.query.userId) {
      filter.userId = req.query.userId;
    } else if (req.query.branch) {
      const branchRegex = new RegExp('(^|,)' + req.query.branch + '(,|$)');
      filter.$or = [
        { audience: 'General' },
        { audience: req.query.branch },
        { audience: { $regex: branchRegex } },
        { audience: { $exists: false } },
        { audience: '' }
      ];
    }

    if (req.query.tag) filter.tags = req.query.tag;

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      const searchOr = { $or: [{ title: searchRegex }, { description: searchRegex }, { tags: searchRegex }] };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchOr];
        delete filter.$or;
      } else {
        filter.$or = [{ title: searchRegex }, { description: searchRegex }, { tags: searchRegex }];
      }
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let sortObj = { createdAt: -1 };
    if (req.query.sort === 'most_answered') sortObj = { answersCount: -1, createdAt: -1 };
    if (req.query.sort === 'unanswered') filter.answersCount = 0;

    const total = await Request.countDocuments(filter);
    const requests = await Request.find(filter).sort(sortObj).skip(skip).limit(limit);

    res.json({ requests, total, page, totalPages: Math.ceil(total / limit), hasMore: page < Math.ceil(total / limit) });
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
    if (!title || !description || !subject)
      return res.status(400).json({ message: 'Title, description and subject are required' });

    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const request = new Request({
      title,
      description,
      subject,
      audience,
      tags: parsedTags,
      userId: req.user.id,
      userName: req.user.name,
      branch: req.user.branch
    });
    await request.save();

    await User.findByIdAndUpdate(req.user.id, { $inc: { reputation: 2 } });

    const io = req.app.get('io');
    io.emit('newRequest', request);

    res.json({ message: 'Request created!', request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE REQUEST — cascade deletes ALL answers + their comments ──────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found' });

    if (request.userId.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });

    // BUG FIX: Always cascade-delete comments for ALL answers of this question,
    // regardless of whether answerIds is empty or not.
    const answers = await Answer.find({ requestId: req.params.id }).select('_id');
    const answerIds = answers.map(a => a._id);

    // Delete all comments belonging to any answer of this question
    if (answerIds.length > 0) {
      await Comment.deleteMany({ answerId: { $in: answerIds } });
      await Answer.deleteMany({ requestId: req.params.id });
    }

    await Request.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;