import express from 'express';
import {
  Conversation,
  ConversationSchemaType,
  Startup,
  Retiree,
  NotificationInsertType,
  RetireeDoc,
  StartupDoc,
  Cooperation,
} from '../../db/schema';
import {
  ConversationCreate,
  ConversationCreateFromJSON,
  ConversationSummary,
  Message,
  MessageCreate,
  MessageFromJSON,
} from '../openapi-client';
import { auth } from '../../middlewares';
import { io } from '../../utils/socket';
import { notifyUser } from '../../utils/notifications';
import { truncateString } from '../../utils/utils';

const router = express.Router();

function conversationMapper(conversation: any) {
  return {
    ...conversation,
    participants: conversation.participants.map((p: any) => ({
      ...p,
      nameLast: p.userType === 'Retiree' ? p.nameLast : p.contactPersonNameLast,
      nameFirst: p.userType === 'Retiree' ? p.nameFirst : p.contactPersonNameFirst,
      profilePicture: p.userType === 'Retiree' ? p.profilePicture : p.contactPersonPicture,
      shortDescription:
        p.userType === 'Retiree' ? p.careerElements[p.careerElements.length - 1].title : p.title,
    })),
    jobPosting: conversation.jobPostingId,
    jobPostingId: undefined,
  };
}

function getConversationSummary(
  conversation: ConversationSchemaType,
  userId: string,
): ConversationSummary {
  const unreadMessageCount =
    conversation.messages.filter((m) => m.senderId._id.toString() !== userId && !m.read).length ||
    0;

  const lastMessage =
    conversation.messages.length > 0
      ? conversation.messages[conversation.messages.length - 1]
      : null;

  return {
    ...conversationMapper({
      ...conversation,
      messages: undefined, // exclude messages to avoid sending large data
    }),
    unreadMessageCount,
    lastMessage: lastMessage,
  };
}

// get all conversations that the user is part of
router.get('/', auth.required, async (req, res) => {
  try {
    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    const userId = req.user!.userId; // userId is guaranteed by middleware

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate(
        'participants jobPostingId',
        'type nameLast nameFirst profilePicture contactPersonNameLast contactPersonNameFirst contactPersonPicture careerElements title',
      )
      .lean();

    const mappedConversations = conversations.map((c) => {
      return getConversationSummary(c as ConversationSchemaType, userId);
    });

    res.status(200).json(mappedConversations);
  } catch (e) {
    console.error('Error fetching conversations:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get conversation by ID
router.get('/:conversationId', auth.required, async (req, res) => {
  try {
    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    const userId = req.user!.userId; // userId is guaranteed by middleware
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate(
        'participants jobPostingId',
        'type nameLast nameFirst profilePicture contactPersonNameLast contactPersonNameFirst contactPersonPicture careerElements title',
      )
      .lean();

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (!conversation.participants.map((p) => p._id.toString()).includes(userId)) {
      res.status(403).json({ error: 'User not part of this conversation' });
      return;
    }

    const cooperation = await Cooperation.findOne({
      jobPostingId: conversation.jobPostingId,
      retireeId: conversation.participants.find((p: any) => p.userType === 'Retiree')?._id,
    });

    res.status(200).json({ ...conversationMapper(conversation), cooperation });
  } catch (e) {
    console.error('Error fetching conversation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// endpoint for marking a conversation as read
router.post('/:conversationId/read', auth.required, async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    const userId = req.user!.userId; // userId is guaranteed by middleware

    // Validate that the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // check that the user is part of the conversation
    if (!conversation.participants.map((p) => p._id.toString()).includes(userId)) {
      res.status(403).json({ error: 'User not part of this conversation' });
      return;
    }

    const readMessages: Message[] = [];

    // Mark all messages that are not by the user as read
    conversation.messages.forEach((message) => {
      if (message.senderId.toString() !== userId && !message.read) {
        message.read = true;
        readMessages.push(MessageFromJSON(message.toJSON()));
      }
    });

    if (readMessages.length === 0) {
      res.status(200).json({ message: 'No unread messages to mark as read' });
      return;
    }

    const updatedConversation = await conversation.save();

    // Emit an event to notify clients in this conversation room that messages have been marked as read
    io.to(conversationId).emit('update-messages', {
      messages: readMessages,
    });
    publishConversationSummary(conversationId, 'conversation-update', userId);

    res.status(200).json(updatedConversation);
  } catch (e) {
    console.error('Error marking conversation as read:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', auth.required, async (req, res) => {
  try {
    const { participantIds, jobPostingId }: ConversationCreate = ConversationCreateFromJSON(
      req.body,
    );

    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    const userId = req.user!.userId; // userId is guaranteed by middleware

    if (!participantIds.has(userId)) {
      participantIds.add(userId);
    }

    if (participantIds.size !== 2) {
      res.status(400).json({ error: 'Conversation must have exactly 2 participants' });
      return;
    }

    // check if conversation between the two users exists already
    const participantsArray = Array.from(participantIds);

    const existingConversation = await Conversation.findOne({
      participants: { $all: participantsArray },
      jobPostingId: jobPostingId,
    })
      .populate(
        'participants jobPostingId',
        'userType nameLast nameFirst profilePicture contactPersonNameLast contactPersonNameFirst contactPersonPicture careerElements title',
      )
      .lean();

    // if conversation exists, return that instead of creating new
    if (existingConversation) {
      const conversationToReturn = getConversationSummary(
        existingConversation as ConversationSchemaType,
        userId,
      );

      res.status(200).json(conversationToReturn);
      return;
    }

    // check if conversation exists between startup and retiree already for other job posting
    const retireeId = participantsArray.find((id) => id !== userId);
    if (retireeId) {
      const existingConversationBetweenStartupAndRetiree = await Conversation.findOne({
        participants: { $all: [userId, retireeId] },
      });

      if (existingConversationBetweenStartupAndRetiree) {
        // Startup already has a conversation with the retiree, no connection reduction
      } else {
        // adjust connection balance if requester is startup
        const requester = await Startup.findById(userId);
        if (requester) {
          const monthlyBalance = requester.get('monthlyConnectionBalance') ?? 0;
          const permanentBalance = requester.get('permanentConnectionBalance') ?? 0;

          if (monthlyBalance > 0) {
            // use monthly connections first
            requester.set('monthlyConnectionBalance', monthlyBalance - 1);
            await requester.save();
          } else if (permanentBalance > 0) {
            requester.set('permanentConnectionBalance', permanentBalance - 1);
            await requester.save();
          } else {
            res.status(403).json({ error: 'Not enough connections left' });
            return;
          }
        }
      }
    }

    // create new conversation if does not exist already
    const newConversation = new Conversation({
      participants: participantsArray,
      jobPostingId,
    });
    const savedConversation = (
      await (
        await newConversation.save()
      ).populate(
        'participants jobPostingId',
        'type nameLast nameFirst profilePicture contactPersonNameLast contactPersonNameFirst contactPersonPicture careerElements title',
      )
    ).toJSON();

    // update retiree isObscured to false for specific startup
    if (retireeId) {
      await Retiree.findByIdAndUpdate(retireeId, { isObscured: false });
    }

    const conversationToReturn: ConversationSummary = {
      ...conversationMapper(savedConversation),
      id: savedConversation._id.toString(),
      unreadMessageCount: 0,
      lastMessage: null,
    };

    const conversationPartner = savedConversation.participants.find(
      (p: any) => p._id.toString() !== userId,
    );
    if (conversationPartner) {
      const userFullname = await getNameByUserId(userId);
      notifyUser(conversationPartner._id.toString(), {
        title: `New connection with ${userFullname}`,
        message: `${userFullname} has initiated a conversation with you. Tap here to engage.`,
        read: false,
        actions: [
          {
            label: 'View',
            url: `/conversation/${savedConversation._id.toString()}`,
          },
        ],
      });
    }

    res.status(201).json(conversationToReturn);
    return;
  } catch (e) {
    console.error('Error creating conversation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function publishConversationSummary(
  conversationId: string,
  type: 'conversation-created' | 'conversation-new-message' | 'conversation-update',
  triggeredByUserId?: string,
  notification?: NotificationInsertType,
) {
  const conversation = await Conversation.findById(conversationId)
    .populate(
      'participants jobPostingId',
      'type nameLast nameFirst profilePicture contactPersonNameLast contactPersonNameFirst contactPersonPicture careerElements title',
    )
    .lean();
  if (!conversation) {
    throw new Error(`Conversation with ID ${conversationId} not found`);
  }
  // send the conversation summary to all participants
  conversation.participants.forEach((participantObjectId) => {
    const participantId = participantObjectId._id.toString();

    io.to(participantId)
      .timeout(1000)
      .emit(
        'conversation-summary-update',
        getConversationSummary(conversation as ConversationSchemaType, participantId),
        (err, response: unknown[]) => {
          if ((err || response.length === 0) && triggeredByUserId !== participantId) {
            if (type === 'conversation-new-message' && notification) {
              notifyUser(participantId, notification).catch((error: unknown) => {
                console.error(
                  `Error notifying user ${participantId} about new message in conversation ${conversationId}:`,
                  error,
                );
              });
            }
          }
        },
      );
  });
}

router.post('/:conversationId/message', auth.required, async (req, res) => {
  try {
    const conversationId = req.params.conversationId;

    // Zod validation for messages
    const { messageSchema } = await import('../../utils/validation');
    const result = messageSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    const message: MessageCreate = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate that the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // check that the user is part of the conversation
    if (!conversation.participants.map((p) => p._id.toString()).includes(userId)) {
      res.status(403).json({ error: 'User not part of this conversation' });
      return;
    }

    // Add the message to the conversation
    conversation.messages.push({
      ...message,
      senderId: userId,
    });
    const updatedConversation = await conversation.save();
    const newMessage = updatedConversation.messages[updatedConversation.messages.length - 1];

    const messageToReturn: Message = MessageFromJSON({
      ...newMessage.toJSON(),
      id: newMessage._id.toString(),
    });

    let senderFullName = '';
    const retiree: RetireeDoc | null = await Retiree.findById(userId);
    if (retiree) {
      senderFullName = `${retiree.nameFirst} ${retiree.nameLast}`;
    } else {
      const startup: StartupDoc | null = await Startup.findById(userId);
      if (startup) {
        senderFullName = `${startup.contactPersonNameFirst ?? ''} ${startup.contactPersonNameLast ?? ''}`;
      }
    }

    // Emit the new message to all clients in this conversation room
    io.to(conversationId).emit('new-message', messageToReturn);
    publishConversationSummary(conversationId, 'conversation-new-message', userId, {
      title: `New message from ${senderFullName}`,
      message: truncateString(message.content, 100),
      timestamp: new Date(),
      read: false,
      actions: [
        {
          label: 'View',
          url: `/conversation/${conversationId}`,
        },
      ],
    });

    res.status(200).json(messageToReturn);
  } catch (e) {
    console.error('Error adding message to conversation:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getNameByUserId(userId: string): Promise<string> {
  const retiree: RetireeDoc | null = await Retiree.findById(userId);
  if (retiree) {
    return `${retiree.nameFirst} ${retiree.nameLast}`;
  }
  const startup: StartupDoc | null = await Startup.findById(userId);
  if (startup) {
    return `${startup.contactPersonNameFirst ?? ''} ${startup.contactPersonNameLast ?? ''}`;
  }
  return 'Unknown User';
}

export default router;
