import cron from 'node-cron';
import { Startup } from '../db/schema.js';
import { createMatchingRun } from './matching.js';

// configuration for subscription tier connection balances
const SUBSCRIPTION_BALANCE_CONFIG = {
  free: 1,
  silver: 10,
  gold: 30,
} as const;

// reset monthly connections for startups based on subscription tier
export const resetMonthlyConnectionBalances = async (): Promise<void> => {
  try {
    const startups = await Startup.find().exec();

    for (const startup of startups) {
      const tier = startup.get('wiseUpSubscriptionTier') as string;
      const newBalance =
        tier in SUBSCRIPTION_BALANCE_CONFIG
          ? SUBSCRIPTION_BALANCE_CONFIG[tier as keyof typeof SUBSCRIPTION_BALANCE_CONFIG]
          : SUBSCRIPTION_BALANCE_CONFIG.free;

      startup.set('monthlyConnectionBalance', newBalance);
      await startup.save();
    }
  } catch (error) {
    console.error('Error resetting monthly connection balances:', error);
  }
};

// schedule a matching run every 10 minutes
// (for testing purposes, in prod might it be reasonable to run it fewer times)
// every minute: '* * * * *'
// every 10 minutes: '0 */10 * * *'
// every hour: '0 * * * *'
export const matchingRunSchedule = {
  cron: '0 */10 * * *', // every 10 minutes
  intervalMinutes: 10, // 10 minutes
};

// initialize all cron jobs for the application
export const initializeCronJobs = (): void => {
  console.log('Initializing cron jobs...');

  // schedule monthly connection reset on first of every month at midnight
  cron.schedule('0 0 1 * *', async () => {
    await resetMonthlyConnectionBalances();
  });

  // schedule matching run based on the defined schedule
  cron.schedule(matchingRunSchedule.cron, async () => {
    await createMatchingRun({});
  });
  // create a matching run immediately on system start
  createMatchingRun({});

  console.log('Cron jobs initialized successfully.');
};
