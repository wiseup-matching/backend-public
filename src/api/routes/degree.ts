import { Router, Request, Response } from 'express';
import { Degree } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

// get all degrees
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const degrees = await Degree.find().lean();

    res.status(200).json(degrees);
  } catch (e) {
    console.error('Error fetching degrees:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
