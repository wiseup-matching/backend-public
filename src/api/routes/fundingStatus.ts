import { Router, Request, Response } from 'express';
import { FundingStatus } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

// get all funding statuses
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const fundingStatuses = await FundingStatus.find().lean();

    res.status(200).json(fundingStatuses);
  } catch (e) {
    console.error('Error fetching funding statuses:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
