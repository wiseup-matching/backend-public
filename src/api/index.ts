// src/api/index.ts
import express from 'express';
import retireesRouter from './routes/retiree.js';
import jobPostingsRouter from './routes/jobPosting.js';
import skillsRouter from './routes/skills.js';
import expertiseAreasRouter from './routes/expertiseAreas.js';
import languagesRouter from './routes/languages.js';
import languageProficiencyLevelsRouter from './routes/languageProficiencyLevels.js';
import authRouter from './routes/auth.js';
import startupRouter from './routes/startup.js';
import cooperationRouter from './routes/cooperation.js';
import degreeRouter from './routes/degree.js';
import positionRouter from './routes/position.js';
import conversationRouter from './routes/conversation.js';
import imageRouter from './routes/image.js';
import FundingStatusRouter from './routes/fundingStatus.js';
import stripeRouter from './routes/stripe.js';
import matchingRouter from './routes/matching.js';
import adminRouter from './routes/admin.js'; // only for testing purposes of monthly connection balance reset

const router = express.Router();

router.use('/', authRouter); // mount auth routes at root for OpenAPI compliance

router.use('/retiree', retireesRouter);
router.use('/job-posting', jobPostingsRouter);
router.use('/skill', skillsRouter);
router.use('/expertise-area', expertiseAreasRouter);
router.use('/language', languagesRouter);
router.use('/language-proficiency-level', languageProficiencyLevelsRouter);
router.use('/degree', degreeRouter);
router.use('/position', positionRouter);
router.use('/startup', startupRouter);
router.use('/cooperation', cooperationRouter);
router.use('/conversation', conversationRouter);
router.use('/image', imageRouter);
router.use('/funding-status', FundingStatusRouter);
router.use('/matching', matchingRouter);
router.use('/stripe', stripeRouter);
router.use('/admin', adminRouter);

export default router;
