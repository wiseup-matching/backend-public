import { Router, Request, Response } from 'express';
import { ExpertiseArea } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

// Get all expertise areas
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const expertiseAreas = await ExpertiseArea.find().lean();

    res.status(200).json(expertiseAreas);
  } catch (err) {
    console.error('Error fetching expertise areas:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Get a specific expertise area by ID
router.get('/:id', auth.required, async (req: Request, res: Response) => {
  try {
    const expertiseArea = await ExpertiseArea.findById(req.params.id).lean();
    if (!expertiseArea) {
      res.status(404).json({ error: 'Expertise Area not found' });
      return;
    }
    res.status(200).json(expertiseArea);
  } catch (err) {
    console.error('Error fetching expertise area:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
