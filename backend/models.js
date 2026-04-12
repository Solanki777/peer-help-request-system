const mongoose = require('mongoose');

// ── USER ──────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
    // Core auth
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },

    // Academic info
    enrollment: { type: String, trim: true, default: '' },   // e.g. 210010107001
    department: { type: String, default: '' },               // full name: Computer Engineering
    branch: { type: String, default: '' },               // short code: CE, IT, EC, ME, CL
    semester: { type: Number, min: 1, max: 8, default: null },
    dob: { type: Date, default: null },

    // Contact
    contact: { type: String, trim: true, default: '' },   // phone number
    city: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },

    // Skills / academic extras
    skills: { type: [String], default: [] },
    interests: { type: String, trim: true, default: '' },   // comma-sep interests

    // Role & approval
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },

    // Gamification
    reputation: { type: Number, default: 0 },
}, { timestamps: true });

// ── REQUEST ───────────────────────────────────────────────────────────────────
const RequestSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    subject: { type: String, required: true },
    audience: { type: String, default: 'General' },
    tags: { type: [String], default: [] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    branch: { type: String, default: '' },
    answersCount: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

// ── ANSWER ────────────────────────────────────────────────────────────────────
const AnswerSchema = new mongoose.Schema({
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    votes: { type: Number, default: 0 },
    votedBy: [{ userId: mongoose.Schema.Types.ObjectId, vote: { type: String, enum: ['up', 'down'] } }],
    isBest: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-increment answersCount on Request when a new Answer is saved
AnswerSchema.post('save', async function () {
    try {
        await mongoose.model('Request').findByIdAndUpdate(
            this.requestId, { $inc: { answersCount: 1 } }
        );
    } catch (e) { /* silent */ }
});

// ── COMMENT ───────────────────────────────────────────────────────────────────
const CommentSchema = new mongoose.Schema({
    answerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Answer', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
}, { timestamps: true });

// ── SUGGESTION ────────────────────────────────────────────────────────────────
const SuggestionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    branch: { type: String, default: '' },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'Other' },
    votes: { type: Number, default: 0 },
    votedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, default: 'pending' },
    adminNote: { type: String, default: '' },
}, { timestamps: true });

// ── SUGGESTION COMMENT ────────────────────────────────────────────────────────
const SuggestionCommentSchema = new mongoose.Schema({
    suggestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suggestion', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SuggestionComment', default: null },
}, { timestamps: true });

// ── NOTIFICATION ──────────────────────────────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: '' },
    isRead: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = {
    User: mongoose.model('User', UserSchema),
    Request: mongoose.model('Request', RequestSchema),
    Answer: mongoose.model('Answer', AnswerSchema),
    Comment: mongoose.model('Comment', CommentSchema),
    Suggestion: mongoose.model('Suggestion', SuggestionSchema),
    SuggestionComment: mongoose.model('SuggestionComment', SuggestionCommentSchema),
    Notification: mongoose.model('Notification', NotificationSchema),
};