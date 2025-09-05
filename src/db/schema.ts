import mongoose, { Schema, InferSchemaType, HydratedDocument } from 'mongoose';

export type WithId<T = unknown> = T & { _id: string };
// -------------------- USER BASE --------------------
export const actionsSchema = new Schema({
  label: { type: String, required: true },
  url: { type: String, required: true },
});
export type ActionSchemaType = InferSchemaType<typeof actionsSchema>;
export type ActionDoc = HydratedDocument<ActionSchemaType>;
export const notificationsSchema = new Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false, required: true },
  actions: [actionsSchema],
  timestamp: { type: Date, default: Date.now, required: true },
});
export interface NotificationInsertType {
  title: string;
  message: string;
  read: boolean;
  actions: { label: string; url: string }[];
  timestamp: Date;
}
export type NotificationsSchemaType = InferSchemaType<typeof notificationsSchema>;
export type NotificationsDoc = HydratedDocument<NotificationsSchemaType>;

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    notifications: [notificationsSchema],
  },
  { discriminatorKey: 'userType' },
);
userSchema.index({ userType: 1 });

export const User = mongoose.model('User', userSchema);
export type UserSchemaType = InferSchemaType<typeof userSchema> & {
  userType: 'Retiree' | 'Startup';
};
export type RetireeStartupUserSchemaType = RetireeSchemaType | StartupSchemaType;
export type UserDoc = HydratedDocument<UserSchemaType>;

// -------------------- LANGUAGE --------------------
const languageSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
});
export const Language = mongoose.model('Language', languageSchema);
export type LanguageSchemaType = InferSchemaType<typeof languageSchema>;
export type LanguageDoc = HydratedDocument<LanguageSchemaType>;

const LanguageProficiencyLevelSchema = new Schema({
  level: {
    type: String,
    required: true,
    unique: true,
  },
});
export const LanguageProficiencyLevel = mongoose.model(
  'LanguageProficiencyLevel',
  LanguageProficiencyLevelSchema,
);
export type LanguageProficiencyLevelSchemaType = InferSchemaType<
  typeof LanguageProficiencyLevelSchema
>;
export type LanguageProficiencyLevelDoc = HydratedDocument<LanguageProficiencyLevelSchemaType>;

const languageProficiencySchema = new Schema({
  languageId: {
    type: Schema.Types.ObjectId,
    ref: 'language',
    required: true,
  },
  levelId: {
    type: Schema.Types.ObjectId,
    ref: 'LanguageProficiencyLevel',
    required: true,
  },
});
export type LanguageProficiencySchemaType = InferSchemaType<typeof languageProficiencySchema>;
export type LanguageProficiencyDoc = HydratedDocument<LanguageProficiencySchemaType>;

// -------------------- SKILL / EXPERTISE / DEGREE / Position --------------------
const skillSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
});
export const Skill = mongoose.model('Skill', skillSchema);
export type SkillSchemaType = InferSchemaType<typeof skillSchema>;
export type SkillDoc = HydratedDocument<SkillSchemaType>;

const expertiseAreaSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
});
export const ExpertiseArea = mongoose.model('ExpertiseArea', expertiseAreaSchema);
export type ExpertiseAreaSchemaType = InferSchemaType<typeof expertiseAreaSchema>;
export type ExpertiseAreaDoc = HydratedDocument<ExpertiseAreaSchemaType>;

const degreeSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
});
export const Degree = mongoose.model('Degree', degreeSchema);
export type DegreeSchemaType = InferSchemaType<typeof degreeSchema>;
export type DegreeDoc = HydratedDocument<DegreeSchemaType>;

const PositionSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
});
export const Position = mongoose.model('Position', PositionSchema);
export type PositionSchemaType = InferSchemaType<typeof PositionSchema>;
export type PositionDoc = HydratedDocument<PositionSchemaType>;

// -------------------- RETIREE --------------------
export const careerElementSchema = new Schema({
  kind: { type: String, enum: ['education', 'job'], required: true },
  title: { type: String, required: true },
  fromDate: { type: Date, required: true },
  untilDate: Date,
  description: String,
  organizationName: String,
  finalGrade: String,
  degree: { type: Schema.Types.ObjectId, ref: 'Degree' },
  position: { type: Schema.Types.ObjectId, ref: 'Position' },
});
export type CareerElementSchemaType = InferSchemaType<typeof careerElementSchema>;
export type CareerElementDoc = HydratedDocument<CareerElementSchemaType>;
const retireeSchema = new Schema({
  nameFirst: { type: String, default: '' },
  nameLast: { type: String, default: '' },
  aboutMe: String,
  profilePicture: String,
  birthday: Date,
  retiredSince: Date,
  expectedHourlySalaryEUR: Number,
  desiredWorkHoursPerWeek: Number,
  addressStreet: String,
  addressZip: String,
  addressCity: String,
  addressCountry: String,
  hasCompletedTutorial: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['available', 'atcapacity'],
    required: true,
    default: 'atcapacity',
  },
  skills: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Skill' }],
    validate: {
      validator: (arr: mongoose.Types.ObjectId[]) => arr.length <= 10,
      message: 'A retiree can have a maximum of 10 skills.',
    },
  },
  expertiseAreas: {
    type: [{ type: Schema.Types.ObjectId, ref: 'ExpertiseArea' }],
    validate: {
      validator: (arr: mongoose.Types.ObjectId[]) => arr.length <= 5,
      message: 'A retiree can have a maximum of 5 expertise areas.',
    },
  },
  languageProficiencies: [languageProficiencySchema],
  careerElements: [careerElementSchema],
});
retireeSchema.index({ skills: 1, addressZip: 1, addressCountry: 1 });
export const Retiree = User.discriminator('Retiree', retireeSchema);
export type RetireeSchemaType = InferSchemaType<typeof retireeSchema> & {
  userType: 'Retiree';
};
export type RetireeDoc = HydratedDocument<RetireeSchemaType>;

// -------------------- FUNDING STATUS --------------------

const fundingStatusSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
});
export const FundingStatus = mongoose.model('FundingStatus', fundingStatusSchema);
export type FundingStatusSchemaType = InferSchemaType<typeof fundingStatusSchema>;
export type FundingStatusDoc = HydratedDocument<FundingStatusSchemaType>;

// -------------------- STARTUP --------------------
const startupSchema = new Schema({
  title: { type: String, default: '' },
  aboutUs: { type: String },
  contactPersonNameLast: { type: String },
  contactPersonNameFirst: { type: String },
  contactPersonPicture: String,
  industry: { type: String },
  addressCity: { type: String },
  addressCountry: { type: String },
  fundingStatus: { type: Schema.Types.ObjectId, ref: 'FundingStatus' },
  fulltimeEmployeesNum: { type: Number },
  foundingYear: { type: Number },
  revenuePerYearEUR: { type: Number },
  imprintUrl: String,
  websiteUrl: String,
  logoUrl: String,
  stripeCustomerId: String,
  stripePriceId: String,
  stripeSubscriptionExpiryDate: Date,
  wiseUpSubscriptionTier: {
    type: String,
    enum: ['free', 'silver', 'gold', null],
    default: null,
  },
  monthlyConnectionBalance: { type: Number, default: 0 },
  permanentConnectionBalance: { type: Number, default: 0 },
  jobPostings: [{ type: Schema.Types.ObjectId, ref: 'JobPosting' }],
});
export const Startup = User.discriminator('Startup', startupSchema);
export type StartupSchemaType = InferSchemaType<typeof startupSchema> & {
  userType: 'Startup';
};
export type StartupDoc = HydratedDocument<StartupSchemaType>;

// -------------------- JOB POSTING --------------------
const jobPostingSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  requiredZip: String,
  requiredCity: String,
  requiredCountry: String,
  approxDurationWeeks: Number,
  approxHoursPerWeek: Number,
  approxDaysPerWeek: Number,
  approxHourlySalaryEUR: Number,
  desiredStartDate: Date,
  startupId: { type: Schema.Types.ObjectId, ref: 'Startup', required: true },
  matches: [{ type: Schema.Types.ObjectId, ref: 'Match' }],
  matchingLanguageProficiencies: [languageProficiencySchema],
  matchingSkills: [{ type: Schema.Types.ObjectId, ref: 'Skill' }],
  matchingExpertiseAreas: [{ type: Schema.Types.ObjectId, ref: 'ExpertiseArea' }],
  matchingDegrees: [{ type: Schema.Types.ObjectId, ref: 'Degree' }],
  matchingPositions: [{ type: Schema.Types.ObjectId, ref: 'Position' }],
  createdAt: { type: Date, default: Date.now },
});
export const JobPosting = mongoose.model('JobPosting', jobPostingSchema);
export interface PopulatedJobPosting {
  startupId: (StartupSchemaType & { _id: string }) | null;
  matches: MatchSchemaType[] | null;
}
export type JobPostingSchemaType = InferSchemaType<typeof jobPostingSchema>;
export type JobPostingDoc = HydratedDocument<JobPostingSchemaType>;

// -------------------- MATCH / MATCHING RUN / COOPERATION --------------------
const MatchingRunSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  isFullRun: { type: Boolean, default: false }, // whether the matching was between all job postings and retirees
});
export const MatchingRun = mongoose.model('MatchingRun', MatchingRunSchema);
export type MatchingRunSchemaType = InferSchemaType<typeof MatchingRunSchema>;
export type MatchingRunDoc = HydratedDocument<MatchingRunSchemaType>;

const matchSchema = new Schema({
  matchingRun: { type: Schema.Types.ObjectId, ref: 'MatchingRun', required: true },
  score: { type: Number, required: true },
  retiree: { type: Schema.Types.ObjectId, ref: 'Retiree', required: true },
  jobPosting: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  createdAt: { type: Date, default: Date.now },
});
matchSchema.index({ retiree: 1, jobPosting: 1, matchingRun: 1 }, { unique: true });
export const Match = mongoose.model('Match', matchSchema);
export type MatchSchemaType = InferSchemaType<typeof matchSchema>;
export type MatchDoc = HydratedDocument<MatchSchemaType>;

const cooperationSchema = new Schema({
  retireeId: { type: Schema.Types.ObjectId, ref: 'Retiree', required: true },
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

export const Cooperation = mongoose.model('Cooperation', cooperationSchema);
export interface PopulatedCooperation {
  retireeId: (RetireeSchemaType & { _id: string }) | null;
  jobPostingId: (JobPostingSchemaType & { _id: string }) | null;
}
export type CooperationSchemaType = InferSchemaType<typeof cooperationSchema>;
export type CooperationDoc = HydratedDocument<CooperationSchemaType>;

// -------------------- MESSAGING --------------------
const messageSchema = {
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
};

const conversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting' },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
});
conversationSchema.index({ participants: 1 });
export const Conversation = mongoose.model('Conversation', conversationSchema);
export type ConversationSchemaType = InferSchemaType<typeof conversationSchema>;
export type ConversationDoc = HydratedDocument<ConversationSchemaType>;

// -------------------- City - Coords --------------------

const zipCoordsSchema = new Schema({
  country: { type: String, required: true },
  zip: { type: String, required: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
});
export const ZipCoords = mongoose.model('ZipCoords', zipCoordsSchema);
export type ZipCoordsSchemaType = InferSchemaType<typeof zipCoordsSchema>;
export type ZipCoordsDoc = HydratedDocument<ZipCoordsSchemaType>;
