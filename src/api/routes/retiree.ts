import { Router, Request, Response } from 'express';
import { Retiree, Conversation } from '../../db/schema';
import type { RetireeSchemaType } from '../../db/schema';
import { auth } from '../../middlewares';
import mongoose from 'mongoose';
import { notifyUser } from '../../utils/notifications';
import { RetireeUpdateFromJSON } from '../openapi-client';
import { createMatchingRun } from '../../utils/matching';

type UpdateCareerElement = Partial<RetireeSchemaType['careerElements'][number]>;

type RetireeUpdateBody = Partial<Omit<RetireeSchemaType, 'careerElements'>> & {
  careerElements?: UpdateCareerElement[];
};

const router = Router();

// helper function to obscure retiree data for startups without a conversation with retiree
function obscureRetireeData(
  retiree: RetireeSchemaType,
): RetireeSchemaType & { isObscured: boolean } {
  return {
    ...retiree,
    nameFirst: 'Lorem',
    nameLast: 'Ipsum',
    profilePicture: 'hiddenProfilePicture',
    careerElements: retiree.careerElements.map((element) => ({
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...element,
      organizationName: 'Lorem Ipsum Organization',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    })) as unknown as typeof retiree.careerElements,
    isObscured: true,
  };
}

// Get all retiree profiles
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const retirees = await Retiree.find().lean();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!; // guaranteed by auth middleware
    const isStartup = user.userType === 'Startup';

    if (!isStartup) {
      const unobscuredRetirees = retirees.map((retiree) => ({
        ...retiree,
        isObscured: false,
      }));
      res.status(200).json(unobscuredRetirees);
      return;
    }

    const startupId = user.userId;

    const conversations = await Conversation.find({
      participants: new mongoose.Types.ObjectId(startupId),
    }).lean();

    const retireeIdsWithConversation = new Set(
      conversations.flatMap((conv) =>
        conv.participants.filter((p) => p.toString() !== startupId).map((p) => p.toString()),
      ),
    );

    const processedRetirees = retirees.map((retiree) => {
      const retireeId = String(retiree._id);

      if (retireeIdsWithConversation.has(retireeId)) {
        return { ...retiree, isObscured: false };
      }

      return obscureRetireeData(retiree as unknown as RetireeSchemaType);
    });

    res.status(200).json(processedRetirees);
  } catch (err) {
    console.error('Error fetching retiree profiles:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get a specific retiree profile by ID
router.get('/:id', auth.required, async (req: Request, res: Response) => {
  try {
    const retiree = await Retiree.findById(req.params.id)

      .lean<RetireeSchemaType>();
    if (!retiree) {
      res.status(404).json({ error: 'Retiree not found' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!;
    const isStartup = user.userType === 'Startup';

    if (!isStartup || user.userId === req.params.id) {
      res.status(200).json({ ...retiree, isObscured: false });
      return;
    }

    const conversation = await Conversation.findOne({
      participants: {
        $all: [
          new mongoose.Types.ObjectId(user.userId),
          new mongoose.Types.ObjectId(req.params.id),
        ],
      },
    }).lean();

    if (conversation) {
      res.status(200).json({ ...retiree, isObscured: false });
    } else {
      res.status(200).json(obscureRetireeData(retiree));
    }
  } catch (err) {
    console.error('Error fetching retiree:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update an existing retiree profile by ID
router.put(
  '/:id',
  auth.required,
  async (req: Request<{ id: string }, unknown, RetireeUpdateBody>, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!; // guaranteed by auth middleware
    const updateBody = req.body;

    if (RetireeUpdateFromJSON(req.body).id !== user.userId || req.params.id !== user.userId) {
      res.status(403).json({ error: 'You can only update your own profile' });
      return;
    }

    if (updateBody.careerElements) {
      updateBody.careerElements = updateBody.careerElements.map((element) => {
        if (typeof element._id === 'string' && element._id === 'NO_ID') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _id, ...elementWithoutId } = element;
          return elementWithoutId;
        }
        return element;
      });
      // sort career elements by until date, newest first
      updateBody.careerElements.sort((a, b) => {
        const aUntil = a.untilDate ? new Date(a.untilDate) : new Date();
        const bUntil = b.untilDate ? new Date(b.untilDate) : new Date();
        return bUntil.getTime() - aUntil.getTime();
      });
    }

    try {
      // Zod validation for updates
      const { partialRetireeSchema } = await import('../../utils/validation');

      const result = partialRetireeSchema.safeParse(updateBody);
      if (!result.success) {
        res.status(400).json({ errors: result.error.flatten() });
        return;
      }

      const retireeDoc = await Retiree.findById(req.params.id);
      if (!retireeDoc) {
        res.status(404).json({ error: 'Retiree not found' });
        return;
      }
      const retiree = retireeDoc.toObject<RetireeSchemaType>();

      retireeDoc.set(result.data);

      const isFirstUpdate = !retiree.nameLast && result.data.nameLast;
      if (isFirstUpdate) {
        // check if profile is complete and set status to 'available'
        const updatedRetiree = { ...retiree, ...result.data };
        const isProfileComplete = updatedRetiree.nameFirst && updatedRetiree.nameLast;

        if (isProfileComplete) {
          retireeDoc.set({ status: 'available' });
        }
      }

      const saved = await retireeDoc.save();
      res.status(200).json(saved);

      if (isFirstUpdate) {
        // create a first matching run for the retiree, for later runs the scheduled cron job will take care
        createMatchingRun({ retireeId: retiree._id.toString() });
        // Wait 5 seconds, then send a signup notification
        setTimeout(() => {
          notifyUser(retiree._id.toString(), {
            title: 'Signed up successfully!',
            message:
              'We are finding the right opportunities for you...\nIn the meantime, feel free to browse on your own. New jobs are added daily!',
            read: false,
            actions: [
              {
                label: 'Browse Jobs',
                url: '/retiree/browse-jobs',
              },
            ],
          });
        }, 5000);
      }
    } catch (err) {
      console.error('Error updating retiree:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },
);

// Delete a retiree profile by ID
router.delete('/:id', auth.required, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!;
    if (user.userId !== req.params.id) {
      res.status(403).json({ error: 'You can only delete your own profile' });
      return;
    }

    const deletedRetiree = await Retiree.findByIdAndDelete(req.params.id).lean();

    if (!deletedRetiree) {
      res.status(404).json({ error: 'Retiree not found' });
      return;
    }
    res.status(200).json({ message: 'Retiree deleted successfully', isObscured: false });
  } catch (err) {
    console.error('Error deleting retiree:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
