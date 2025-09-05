import { Router, Request, Response } from 'express';
import { Position } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

// get all positions
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const positions = await Position.find().lean();

    res.status(200).json(positions);
  } catch (e) {
    console.error('Error fetching positions:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
