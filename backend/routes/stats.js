const express = require('express');
const router = express.Router();

const { Request, Answer, User } = require('../models');

router.get('/', async (req, res) => {
  try {
    router.get('/', async (req, res) => {
      try {
        const totalQuestions = await Request.countDocuments({ status: 'approved', isHidden: { $ne: true } });
        const totalUsers = await User.countDocuments({ status: 'approved', role: 'student' });
        const answeredQuestions = await Request.countDocuments({ status: 'approved', isHidden: { $ne: true }, answersCount: { $gt: 0 } });

        const totalAnswers = await Answer.countDocuments({ isHidden: { $ne: true } });

        const subjectStats = await Request.aggregate([
          { $match: { status: 'approved', isHidden: { $ne: true } } },
          { $group: { _id: '$subject', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 }
        ]);

        const topUser = await User.findOne({ status: 'approved', role: 'student' })
          .sort({ reputation: -1 })
          .select('name reputation');

        res.json({
          totalQuestions,
          totalAnswers,
          answeredQuestions,
          totalUsers,
          popularSubject: subjectStats[0] ? subjectStats[0]._id : 'N/A',
          topUser: topUser ? { name: topUser.name, reputation: topUser.reputation } : null
        });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });
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