const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { User, Answer, Request } = require('../models');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY_GTU_2024';

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
}

// Password strength: min 8 chars, at least 1 uppercase, 1 number, 1 special char
function isStrongPassword(pw) {
  return pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw);
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const {
      name, enrollment, email, contact, dob,
      department, branch, semester,
      city, bio, interests, skills,
      password
    } = req.body;

    // Required field validation
    if (!name || !name.trim())
      return res.status(400).json({ message: 'Full name is required' });
    if (!enrollment || !enrollment.trim())
      return res.status(400).json({ message: 'Enrollment number is required' });
    if (!email || !email.trim())
      return res.status(400).json({ message: 'Email is required' });
    if (!contact || !contact.trim())
      return res.status(400).json({ message: 'Contact number is required' });
    if (!dob)
      return res.status(400).json({ message: 'Date of birth is required' });
    if (!department)
      return res.status(400).json({ message: 'Department is required' });
    if (!semester)
      return res.status(400).json({ message: 'Semester is required' });
    if (!password)
      return res.status(400).json({ message: 'Password is required' });

    if (!isStrongPassword(password))
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character (!@#$...)'
      });

    // Uniqueness checks
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ message: 'Email is already registered' });

    const existingEnrollment = await User.findOne({ enrollment: enrollment.trim() });
    if (existingEnrollment) return res.status(400).json({ message: 'Enrollment number is already registered' });

    const hashed = await bcrypt.hash(password, 10);

    const skillsArr = skills
      ? (Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim()).filter(Boolean))
      : [];

    await new User({
      name: name.trim(),
      enrollment: enrollment.trim(),
      email: email.toLowerCase().trim(),
      contact: contact.trim(),
      dob: new Date(dob),
      department: department,
      branch: branch || '',
      semester: parseInt(semester),
      city: city ? city.trim() : '',
      bio: bio ? bio.trim() : '',
      interests: interests ? interests.trim() : '',
      skills: skillsArr,
      password: hashed,
      status: 'pending',
      role: 'student'
    }).save();

    res.json({ message: '✅ Registration submitted! An admin will review and approve your account.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'No account found with this email' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Incorrect password' });

    // Admins bypass the approval gate
    if (user.role !== 'admin') {
      if (user.status === 'pending')
        return res.status(403).json({ message: '⏳ Your account is pending admin approval. Please wait.' });
      if (user.status === 'rejected')
        return res.status(403).json({ message: '❌ Your account was not approved. Please contact admin.' });
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
        enrollment: user.enrollment,
        branch: user.branch, department: user.department,
        semester: user.semester, contact: user.contact,
        role: user.role, reputation: user.reputation, status: user.status
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

// ── UPDATE OWN PROFILE ────────────────────────────────────────────────────────
router.put('/profile/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You can only edit your own profile' });

    const ALLOWED = ['name', 'enrollment', 'contact', 'dob', 'department', 'branch',
      'semester', 'city', 'bio', 'interests', 'skills'];
    const updates = {};
    ALLOWED.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (updates.name) updates.name = updates.name.trim();
    if (updates.skills !== undefined)
      updates.skills = Array.isArray(updates.skills)
        ? updates.skills
        : updates.skills.split(',').map(s => s.trim()).filter(Boolean);
    if (updates.semester) updates.semester = parseInt(updates.semester);
    if (updates.dob) updates.dob = new Date(updates.dob);

    // Password change (optional, student-only)
    if (req.body.newPassword) {
      if (!isStrongPassword(req.body.newPassword))
        return res.status(400).json({ message: 'New password must be ≥8 chars with uppercase, number, and special char' });
      // Verify old password first
      const user = await User.findById(req.params.id);
      const ok = await bcrypt.compare(req.body.currentPassword || '', user.password);
      if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });
      updates.password = await bcrypt.hash(req.body.newPassword, 10);
    }

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
        _id: a._id, content: a.content, votes: a.votes,
        isBest: a.isBest, createdAt: a.createdAt,
        requestId: a.requestId,
        requestTitle: q ? q.title : '(deleted)',
        requestSubject: q ? q.subject : ''
      };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;