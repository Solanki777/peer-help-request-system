const express = require('express');
const router = express.Router();

const { Request, Answer, User } = require('../models');

router.get('/', async (req, res) => {
  try {
    const totalQuestions = await Request.countDocuments();
    const totalUsers = await User.countDocuments();

    // "Answered Questions" = questions that have at least 1 answer
    const answeredQuestions = await Request.countDocuments({ answersCount: { $gt: 0 } });

    const subjectStats = await Request.aggregate([
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    const topUser = await User.findOne().sort({ reputation: -1 }).select('name reputation');

    res.json({
      totalQuestions,
      answeredQuestions,   // replaces totalAnswers on dashboard
      totalUsers,
      popularSubject: subjectStats[0] ? subjectStats[0]._id : 'N/A',
      topUser: topUser ? { name: topUser.name, reputation: topUser.reputation } : null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;