import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Response, Request } from 'express';

import dotenv from 'dotenv';
dotenv.config();
import * as middlewares from './middlewares.js';
import api from './api/index.js';
import stripeWebhookRouter from './api/routes/stripeWebhook.js';

import connectDB from './db/db.js';
import { initializeCronJobs } from './utils/cronJobs.js';

const app = express();

// Basic Middlewares

// Mount Stripe webhook BEFORE any body‑parsing middleware
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhookRouter);

app.use(morgan('dev'));
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// Register routes (only mount the api router)
app.use('/api/v1', api);

// Connect to database
void connectDB()
  .then(() => {
    console.log('Database connected successfully');
    // initialize cron jobs after database connection
    initializeCronJobs();
  })
  .catch((error: unknown) => {
    console.error('Database connection error:', error);
    process.exit(1);
  });

app.get('/', (_: Request, res: Response) => {
  res.json({
    message: 'Welcome to our Backend. You can access the API at /api/v1',
  });
});

// 404 / error handlers stay at the very bottom
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

export { app };
