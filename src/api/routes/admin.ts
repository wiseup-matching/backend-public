import express from 'express';
import type { Request, Response } from 'express';
import { resetMonthlyConnectionBalances } from '../../utils/cronJobs.js';
import { auth } from '../../middlewares.js';

const router = express.Router();

// Testing endpoint to manually trigger monthly connection reset, only intended for testing purposes
// This is a temporary endpoint for testing purposes and should be removed in production
// run in terminal: curl -X POST http://localhost:4000/api/v1/admin/reset-monthly-balances -H "Content-Type: application/json"
router.post(
  '/reset-monthly-balances',
  auth.required,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await resetMonthlyConnectionBalances();
      res.status(200).json({
        message: 'Monthly connection balances reset successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error in manual balance reset:', error);
      res.status(500).json({
        error: 'Failed to reset monthly connection balances',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);

export default router;
