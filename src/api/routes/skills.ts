import { Router, Request, Response } from 'express';
import { Skill } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

// Get all skills
router.get('/', auth.required, async (_req: Request, res: Response) => {
  try {
    const skills = await Skill.find().lean();

    res.status(200).json(skills);
  } catch (err) {
    console.error('Error fetching skills:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Get a specific skill by ID
router.get('/:id', auth.required, async (req: Request, res: Response) => {
  try {
    const skill = await Skill.findById(req.params.id).lean();
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.status(200).json(skill);
  } catch (err) {
    console.error('Error fetching skill:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
