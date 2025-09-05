import { Router, Request, Response } from 'express';
import { Language } from '../../db/schema';
import { auth } from '../../middlewares';

const router = Router();

router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const postings = await Language.find().lean();

    const transformedPostings = postings.map((posting) => ({
      _id: posting._id.toString(),
      name: posting.name,
    }));
    res.status(200).json(transformedPostings);
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
