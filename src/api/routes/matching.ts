import { Request, Response, Router } from 'express';
import { createMatchingRun } from '../../utils/matching';
import { RunMatchingPostRequest } from '../openapi-client';
import { auth } from '../../middlewares';

const router = Router();

// Testing endpoint for creating a matching run
// This is a temporary endpoint for testing purposes and should be removed in production
router.post('/test-run-matching', auth.required, async (req: Request, res: Response) => {
  try {
    const { matchingRunRequest }: RunMatchingPostRequest = req.body;
    const matchingRun = await createMatchingRun({ jobPostingId: matchingRunRequest.jobPostingId });
    res.status(200).json(matchingRun);
  } catch (error) {
    console.error('Error creating matching run:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
