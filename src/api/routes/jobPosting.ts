import { Router, Request, Response } from 'express';
import { JobPosting, Startup, Match, StartupSchemaType } from '../../db/schema';
import { JobPostingCreate, JobPostingUpdate } from '../openapi-client';
import { auth } from '../../middlewares';
import { createMatchingRun } from '../../utils/matching';
import { Types } from 'mongoose';

const router = Router();

router.get('/', auth.required, async (req: Request, res: Response) => {
  // all job postings are public, so no need to check for special user authorization
  try {
    const postings = await JobPosting.find().populate('startupId', 'wiseUpSubscriptionTier').lean();

    const fixedPostings = postings.map((posting) => ({
      ...posting,
      startupId: posting.startupId._id.toString(),
      subscriptionTier: (posting.startupId as unknown as StartupSchemaType).wiseUpSubscriptionTier,
    }));

    res.status(200).json(fixedPostings);
  } catch (err) {
    console.error('Error fetching job postings:', err);
    res.status(500).json({ error: 'Internal server Error' });
  }
});

router.get('/:jobPostingId', auth.required, async (req: Request, res: Response): Promise<void> => {
  // all job postings are public, so no need to check for special user authorization
  try {
    const jobPostingId = req.params.jobPostingId;
    const posting = await JobPosting.findById(jobPostingId)
      .populate('startupId', 'wiseUpSubscriptionTier')
      .lean();

    if (!posting) {
      res.status(404).json({ error: 'Job posting not found' });
      return;
    }

    const fixedJobPosting = {
      ...posting,
      startupId: posting.startupId._id.toString(),
      subscriptionTier: (posting.startupId as unknown as StartupSchemaType).wiseUpSubscriptionTier,
    };

    res.status(200).json(fixedJobPosting);
  } catch (err) {
    console.error('Error fetching job posting:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/:jobPostingId/matches',
  auth.required,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const userId = req.user!.userId; // guaranteed by auth middleware
      const jobPostingId = req.params.jobPostingId;

      // Check if the user is authorized to view matches for this job posting
      const jobPosting = await JobPosting.findById(jobPostingId).lean();
      if (!jobPosting || jobPosting.startupId.toString() !== userId) {
        res.status(403).json({ error: 'User must be owner of job posting' });
        return;
      }

      // Fetch all unique matches for this job posting, keeping most recent match per retiree
      const uniqueMatches = await Match.aggregate([
        { $match: { jobPosting: new Types.ObjectId(jobPostingId) } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$retiree',
            match: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$match' } },
      ]);

      if (!uniqueMatches.length) {
        res.status(404).json({ error: 'No matches found for this job posting' });
        return;
      }
      res.status(200).json(uniqueMatches);
    } catch (err) {
      console.error('Error fetching matches for job posting:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/', auth.required, async (req: Request, res: Response): Promise<void> => {
  try {
    // get job posting data from req.body
    const jobPostingData =
      (req.body as { jobPostingCreate?: JobPostingCreate }).jobPostingCreate ??
      (req.body as JobPostingCreate);

    // Zod-Validierung
    const { jobPostingSchema } = await import('../../utils/validation');
    const result = jobPostingSchema.safeParse(jobPostingData);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const userId = req.user!.userId; // guaranteed by auth middleware
    // Check if the user is authorized to create a job posting
    if (userId !== jobPostingData.startupId) {
      res.status(403).json({ error: 'User must be owner of startup to create job posting' });
      return;
    }

    // create new job posting with data
    const newJobPosting = new JobPosting(result.data);
    const savedJobPosting = await newJobPosting.save();

    // add job posting to corresponding startup
    if ('startupId' in result.data && result.data.startupId) {
      const updatedStartup = await Startup.findByIdAndUpdate(
        result.data.startupId,
        { $push: { jobPostings: savedJobPosting._id } },
        { new: true },
      );
      if (!updatedStartup) {
        res.status(404).json({ error: 'Startup not found' });
        return;
      }
    }

    // create a matching run for the new job posting
    createMatchingRun({ jobPostingId: savedJobPosting._id.toString() }).then();

    // return status job posting
    res.status(201).json(savedJobPosting);
  } catch (err) {
    console.error('Error creating job posting:', err);
    res.status(400).json({
      error: 'Failed to create job posting',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.put('/:jobPostingId', auth.required, async (req: Request, res: Response): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const userId = req.user!.userId; // guaranteed by auth middleware
    const jobPostingId = req.params.jobPostingId;
    const jobPostingData = req.body as JobPostingUpdate;

    // Zod-Validierung
    const { partialJobPostingSchema } = await import('../../utils/validation');
    const result = partialJobPostingSchema.safeParse(jobPostingData);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    const jobPosting = await JobPosting.findById(jobPostingId).lean();
    if (!jobPosting || jobPosting.startupId.toString() !== userId) {
      res.status(403).json({ error: 'User must be owner of job posting' });
      return;
    }

    const updatedJobPosting = await JobPosting.findByIdAndUpdate(jobPostingId, result.data, {
      new: true,
    }).populate('matchingSkills matchingExpertiseAreas');

    if (!updatedJobPosting) {
      res.status(404).json({ error: 'Job posting not found' });
      return;
    }

    // create a matching run for the updated job posting
    createMatchingRun({ jobPostingId: updatedJobPosting._id.toString() }).then();

    res.status(200).json(updatedJobPosting);
  } catch (err) {
    console.error('Error updating job posting:', err);
    res.status(400).json({
      error: 'Failed to update job posting',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete(
  '/:jobPostingId',
  auth.required,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const userId = req.user!.userId; // guaranteed by auth middleware
      const jobPostingId = req.params.jobPostingId;

      // Check if the user is authorized to delete this job posting
      const jobPosting = await JobPosting.findById(jobPostingId).lean();
      if (!jobPosting || jobPosting.startupId.toString() !== userId) {
        res.status(403).json({ error: 'User must be owner of job posting' });
        return;
      }

      const deletedJobPosting = await JobPosting.findByIdAndDelete(jobPostingId);

      if (!deletedJobPosting) {
        res.status(404).json({ error: 'Job posting not found' });
        return;
      }

      // remove the job posting from the correspond startup
      await Startup.findByIdAndUpdate(
        deletedJobPosting.startupId,
        { $pull: { jobPostings: jobPostingId } },
        { new: true },
      );

      res.status(200).json({ message: 'Job posting deleted successfully' });
    } catch (err) {
      console.error('Error deleting job posting:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// Find all job postings that have no hired retiree (i.e., no accepted cooperation
export async function getJobPostingIdsWithoutHiredRetirees(): Promise<string[]> {
  return JobPosting.aggregate([
    {
      $lookup: {
        from: 'cooperation',
        localField: '_id',
        foreignField: 'jobPostingId',
        as: 'cooperation',
      },
    },
    {
      $match: {
        $or: [{ cooperation: { $size: 0 } }, { 'cooperation.status': { $ne: 'accepted' } }],
      },
    },
    { $project: { _id: 1 } },
  ]).then((results) => results.map((result: { _id: Types.ObjectId }) => result._id.toString()));
}

export default router;
