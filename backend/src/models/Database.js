const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const resumeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: String,
    rawText: String,
    warning: String,
    parsed: {
      summary: { type: String, default: '' },
      skills: [String],
      projects: [{ _id: false, name: String, description: String, tech: [String] }],
      experience: [{ _id: false, role: String, company: String, duration: String, highlights: [String] }],
      education: [{ _id: false, degree: String, institution: String, year: String }],
    },
  },
  { timestamps: true }
);

const jdSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    title: { type: String, default: 'Untitled role', maxlength: 160 },
    text: { type: String, required: true },
    matchScore: Number,
    matchedSkills: [String],
    missingSkills: [String],
    jdSkills: [String],
    warnings: [String],
    analysis: {
      summary: String,
      gaps: [{ _id: false, skill: String, whyItMatters: String, howToClose: String }],
      missingKeywords: [String],
      resumeTips: [String],
    },
  },
  { timestamps: true }
);

const evaluationSchema = new Schema(
  {
    score: Number,
    summary: String,
    strengths: [String],
    improvements: [String],
    coveredPoints: [String],
    missedPoints: [String],
    ideal: { outline: [String], keyPoints: [String], sampleAnswer: String },
  },
  { _id: false }
);

const interviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    config: {
      role: String,
      interviewType: { type: String, enum: ['Technical', 'Behavioral', 'System Design', 'HR'] },
      difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'] },
      useGaps: Boolean,
      timed: Boolean,
      secondsPerQuestion: Number,
      resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
      jdId: { type: Schema.Types.ObjectId, ref: 'JobDescription' },
    },
    skillGaps: [String],
    questions: [
      { _id: false, text: String, topic: String, skillFocus: String, targetsGap: Boolean, hint: String },
    ],
    answers: [
      {
        _id: false,
        questionIndex: Number,
        answer: String,
        inputMode: { type: String, enum: ['text', 'code', 'voice'], default: 'text' },
        timeTaken: Number,
        evaluation: evaluationSchema,
        answeredAt: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    overallScore: Number, // readiness 0-100
    completedAt: Date,
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model('User', userSchema),
  Resume: mongoose.model('Resume', resumeSchema),
  JobDescription: mongoose.model('JobDescription', jdSchema),
  Interview: mongoose.model('Interview', interviewSchema),
};
