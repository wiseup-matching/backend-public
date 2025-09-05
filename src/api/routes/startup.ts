import { Router, Request, Response } from 'express';
import { Startup } from '../../db/schema';
import type { StartupSchemaType, UserSchemaType } from '../../db/schema';
import { auth } from '../../middlewares';
import { notifyUser } from '../../utils/notifications';
import { StartupUpdateFromJSON } from '../openapi-client';

// Narrow the request body to a safe subset of the Startup schema
type StartupUpdateBody = Partial<StartupSchemaType>;

const router = Router();

function stripPrivateStartupFields(
  startup: StartupSchemaType & UserSchemaType,
): StartupSchemaType & UserSchemaType {
  // Create a shallow copy and explicitly cast notifications to any to bypass type checking
  return {
    ...startup,
    stripeCustomerId: undefined,
    stripePriceId: undefined,
    monthlyConnectionBalance: 0,
    permanentConnectionBalance: 0,
    stripeSubscriptionExpiryDate: new Date(0),
    notifications: [] as unknown as UserSchemaType['notifications'],
    email: '',
  };
}

// Get all startups
router.get('/', auth.required, async (req: Request, res: Response) => {
  try {
    const startups = (await Startup.find().exec()).map((startup) =>
      startup.toObject<StartupSchemaType & UserSchemaType>(),
    );
    res.status(200).json(startups.map((startup) => stripPrivateStartupFields(startup)));
  } catch (err) {
    console.error('Error fetching startup profiles:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// get startup by id
router.get('/:startupId', auth.required, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!; // guaranteed by auth middleware
    const startup = await Startup.findById(req.params.startupId).exec();
    if (!startup) {
      res.status(404).json({ error: 'Startup not found' });
      return;
    }

    // If the requesting user is not the startup owner, strip private fields
    if (startup._id.toString() !== user.userId) {
      res
        .status(200)
        .json(stripPrivateStartupFields(startup.toObject<StartupSchemaType & UserSchemaType>()));
      return;
    }

    res.status(200).json(startup);
  } catch (err) {
    console.error('Error fetching startup:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an existing startup profile by ID
router.put(
  '/:id',
  auth.required,
  async (req: Request<{ id: string }, unknown, StartupUpdateBody>, res: Response) => {
    try {
      // Zod validation for updates
      const body = StartupUpdateFromJSON(req.body);
      body.userType = 'Startup';
      const { partialStartupSchema } = await import('../../utils/validation');
      const result = partialStartupSchema.safeParse(body);
      if (!result.success) {
        res.status(400).json({ errors: result.error.flatten() });
        return;
      }
      const startupDoc = await Startup.findById(req.params.id);
      if (!startupDoc) {
        res.status(404).json({ error: 'Startup not found' });
        return;
      }
      const startup = startupDoc.toObject<StartupSchemaType>();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = req.user!; // guaranteed by auth middleware
      if (startup._id.toString() !== user.userId) {
        res.status(403).json({ error: 'You can only update your own profile' });
        return;
      }

      startupDoc.set(result.data);
      const saved = await startupDoc.save();
      res.status(200).json(saved);
      const isFirstUpdate = !startup.title && result.data.title;
      if (isFirstUpdate) {
        // Wait 5 seconds before sending the notification
        setTimeout(() => {
          notifyUser(startup._id.toString(), {
            title: 'Signed up successfully!',
            message:
              'You are now ready to create your first job posting and start hiring! Or start directly by browsing our extensive retiree database. New professionals are joining every day!',
            read: false,
            actions: [
              {
                label: 'New Posting',
                url: `/startup/new-posting`,
              },
              {
                label: 'Browse Retirees',
                url: '/startup/browse-retirees',
              },
            ],
          });
        }, 5000);
      }
    } catch (err) {
      console.error('Error updating startup:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },
);

// Delete a startup profile by ID
router.delete('/:id', auth.required, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const user = req.user!; // guaranteed by auth middleware
    if (user.userId !== req.params.id) {
      res.status(403).json({ error: 'You can only delete your own profile' });
      return;
    }

    const deletedStartup = await Startup.findByIdAndDelete(req.params.id).lean();
    if (!deletedStartup) {
      res.status(404).json({ error: 'Startup not found' });
      return;
    }
    res.status(200).json({ message: 'Startup deleted successfully' });
  } catch (err) {
    console.error('Error deleting startup:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
