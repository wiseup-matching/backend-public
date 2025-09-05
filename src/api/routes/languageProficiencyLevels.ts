import { Router, Request, Response } from 'express';
import { LanguageProficiencyLevel } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const proficiencyLevels = await LanguageProficiencyLevel.find().lean();

    const transformedProficiencyLevels = proficiencyLevels.map((level) => ({
      _id: level._id.toString(),
      code: level.level,
    }));
    res.status(200).json(transformedProficiencyLevels);
  } catch (err) {
    console.error('Error fetching language proficiency levels:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
