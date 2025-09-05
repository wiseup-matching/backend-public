import express from 'express';
import {
  Conversation,
  Cooperation,
  CooperationSchemaType,
  JobPosting,
  PopulatedCooperation,
  PopulatedJobPosting,
} from '../../db/schema';
import { auth } from '../../middlewares';
import {
  CooperationCreate,
  CooperationCreateFromJSON,
  CooperationUpdate,
  CooperationUpdateFromJSON,
} from '../openapi-client';
import { notifyUser } from '../../utils/notifications';
import { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';

const router = express.Router();

async function checkAndHandleUserAuthorization(
  user: JwtPayload | undefined,
  cooperation: CooperationSchemaType & { _id: Types.ObjectId },
  res: express.Response,
): Promise<boolean> {
  if (user?.userType === 'Startup') {
    // check whether startup is author of job posting
    const job = await JobPosting.findOne({
      cooperation: cooperation._id,
      startupId: user.userId,
    }).lean();

    if (!job) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
  } else if (user?.userType === 'Retiree') {
    if (cooperation.retireeId._id.toString() !== user.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
  }
  return true;
}

// get all cooperations
router.get('/', auth.required, async (req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const userId = req.user!.userId;

    let cooperations;

    if (req.user?.userType === 'Startup') {
      const jobPostings = await JobPosting.find({ startupId: userId }).lean();
      const jobPostingIds = jobPostings.map((jp) => jp._id);

      cooperations = await Cooperation.find({
        jobPostingId: { $in: jobPostingIds },
      }).lean();
    } else {
      cooperations = await Cooperation.find({
        retireeId: userId,
      }).lean();
    }

    res.status(200).json(cooperations);
  } catch (e) {
    console.error('Error fetching cooperations:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', auth.required, async (req, res) => {
  try {
    const { cooperationSchema } = await import('../../utils/validation');
    const result = cooperationSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    const cooperationData: CooperationCreate = CooperationCreateFromJSON(result.data);

    const job = await JobPosting.findById(cooperationData.jobPostingId)
      .populate<Pick<PopulatedJobPosting, 'startupId'>>('startupId')
      .lean();

    if (req.user?.userId !== job?.startupId?._id.toString()) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const newCooperation = await Cooperation.create(cooperationData);
    const conversation = await Conversation.findOne({
      jobPostingId: cooperationData.jobPostingId,
      participants: cooperationData.retireeId,
    });

    await notifyUser(cooperationData.retireeId, {
      title: 'New Cooperation Request',
      message: `You have received a new cooperation request from ${job?.startupId?.title ?? 'Unknown Startup'}. Open your conversations to accept.`,
      actions: [
        {
          label: 'Open Conversations',
          url: `/conversation/${conversation?._id.toString() ?? ''}`,
        },
      ],
      read: false,
    });

    res.status(201).json(newCooperation);
  } catch (e) {
    console.error('Error creating cooperation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get cooperation by ID
router.get('/:cooperationId', auth.required, async (req, res) => {
  try {
    const cooperation = await Cooperation.findById(req.params.cooperationId).lean();

    if (!cooperation) {
      res.status(404).json({ error: 'Cooperation not found' });
      return;
    }

    if (!(await checkAndHandleUserAuthorization(req.user, cooperation, res))) {
      return;
    }

    res.status(200).json(cooperation);
  } catch (e) {
    console.error('Error fetching cooperation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:cooperationId', auth.required, async (req, res) => {
  try {
    const { cooperationId } = req.params;

    // Zod validation for updates
    const { partialCooperationSchema } = await import('../../utils/validation');
    const result = partialCooperationSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    const updateData: CooperationUpdate = CooperationUpdateFromJSON(result.data);

    const cooperation = await Cooperation.findById(cooperationId);

    if (!cooperation) {
      res.status(404).json({ error: 'Cooperation not found' });
      return;
    }

    if (!(await checkAndHandleUserAuthorization(req.user, cooperation, res))) {
      return;
    }

    const updatedCooperation = await Cooperation.findByIdAndUpdate(cooperationId, updateData, {
      new: true,
    })
      .populate<Pick<PopulatedCooperation, 'jobPostingId' | 'retireeId'>>('jobPostingId retireeId')
      .lean();

    if (!updatedCooperation) {
      res.status(500).json({ error: 'Failed to update cooperation' });
      return;
    }

    const startupId = updatedCooperation.jobPostingId?.startupId._id.toString();
    const retiree = updatedCooperation.retireeId;
    if (req.user?.userType === 'Retiree' && startupId && retiree) {
      // Notify the retiree about the updated cooperation
      await notifyUser(startupId, {
        title:
          updateData.status === 'accepted'
            ? 'Cooperation Accepted'
            : updateData.status === 'declined'
              ? 'Cooperation Declined'
              : 'Cooperation Updated',
        message: `The cooperation with ${retiree.nameFirst} ${retiree.nameLast} has been ${updateData.status === 'accepted' ? 'accepted' : updateData.status === 'declined' ? 'declined' : 'updated'}.`,
        actions: [],
        read: false,
      });
    }

    res.status(200).json(updatedCooperation);
  } catch (e) {
    console.error('Error updating cooperation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
