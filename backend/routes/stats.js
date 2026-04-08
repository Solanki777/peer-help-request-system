const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// GET dashboard stats
router.get('/', async (req, res) => {
    try {
        const Request = mongoose.model('Request');
        const Answer = mongoose.model('Answer');
        const User = mongoose.model('User');

        const totalQuestions = await Request.countDocuments();
        const totalAnswers = await Answer.countDocuments();
        const totalUsers = await User.countDocuments();

        // Most popular subject
        const subjectStats = await Request.aggregate([
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        // Most active user (by reputation)
        const topUser = await User.findOne().sort({ reputation: -1 }).select('name reputation');

        res.json({
            totalQuestions,
            totalAnswers,
            totalUsers,
            popularSubject: subjectStats[0] ? subjectStats[0]._id : 'N/A',
            topUser: topUser ? { name: topUser.name, reputation: topUser.reputation } : null
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;