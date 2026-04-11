const mongoose = require('mongoose');

// ── USER ──────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    branch: { type: String, default: '' },
    skills: { type: [String], default: [] },
    reputation: { type: Number, default: 0 },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

// ── REQUEST ───────────────────────────────────────────────────────────────────
const RequestSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    subject: { type: String, required: true },
    audience: { type: String, default: 'General' },
    tags: { type: [String], default: [] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    branch: { type: String },
    answersCount: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false }
}, { timestamps: true });

// ── ANSWER ────────────────────────────────────────────────────────────────────
const AnswerSchema = new mongoose.Schema({
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    content: { type: String, required: true },
    votes: { type: Number, default: 0 },
    isBest: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    votedBy: { type: [{ userId: mongoose.Schema.Types.ObjectId, vote: String }], default: [] },
    ratings: { type: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, value: Number }], default: [] },
    totalRatings: { type: Number, default: 0 }
}, { timestamps: true });

// Increment answersCount when an answer is saved
AnswerSchema.post('save', async function () {
    await mongoose.model('Request').findByIdAndUpdate(
        this.requestId, { $inc: { answersCount: 1 } }
    );
});

// ── COMMENT ───────────────────────────────────────────────────────────────────
const CommentSchema = new mongoose.Schema({
    answerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Answer', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }
}, { timestamps: true });

// ── NOTIFICATION ──────────────────────────────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String },
    message: { type: String },
    link: { type: String },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

// ── SUGGESTION ────────────────────────────────────────────────────────────────
const SuggestionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    branch: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    category: { type: String, enum: ['Feature', 'Bug', 'Content', 'UI', 'Other'], default: 'Other' },
    votes: { type: Number, default: 0 },
    votedBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ['Open', 'Accepted', 'In Progress', 'Rejected'], default: 'Open' },
    adminNote: { type: String, default: '' }
}, { timestamps: true });

// ── SUGGESTION COMMENT ────────────────────────────────────────────────────────
const SuggestionCommentSchema = new mongoose.Schema({
    suggestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suggestion', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true, trim: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SuggestionComment', default: null }
}, { timestamps: true });

// ── INDEXES ───────────────────────────────────────────────────────────────────
RequestSchema.index({ subject: 1 });
RequestSchema.index({ userId: 1 });
RequestSchema.index({ createdAt: -1 });
RequestSchema.index({ tags: 1 });
AnswerSchema.index({ requestId: 1 });
CommentSchema.index({ answerId: 1, createdAt: 1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
SuggestionSchema.index({ createdAt: -1 });
SuggestionCommentSchema.index({ suggestionId: 1, createdAt: 1 });

// ── EXPORTS ───────────────────────────────────────────────────────────────────
module.exports = {
    User: mongoose.model('User', UserSchema),
    Request: mongoose.model('Request', RequestSchema),
    Answer: mongoose.model('Answer', AnswerSchema),
    Comment: mongoose.model('Comment', CommentSchema),
    Notification: mongoose.model('Notification', NotificationSchema),
    Suggestion: mongoose.model('Suggestion', SuggestionSchema),
    SuggestionComment: mongoose.model('SuggestionComment', SuggestionCommentSchema)
};