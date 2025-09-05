import type { Request } from 'express';
import http from 'http';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { JwtPayload } from '../middlewares';
import * as middlewares from '../middlewares.js';

import { app } from '../app.js';
import { Conversation } from '../db/schema';
import { Cooperation } from '../api/openapi-client';

// eslint-disable-next-line @typescript-eslint/no-misused-promises
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

export type SocketWithUser = Socket & {
  user: JwtPayload;
};

io.use((socket, next) => {
  const req = socket.request;
  const maybeUser: JwtPayload | undefined = middlewares.getUserFromRequest(req as Request);
  if (!maybeUser) {
    next(new Error('Authentication error'));
    return;
  }
  (socket as SocketWithUser).user = maybeUser;
  next();
});

// Socket.IO event handlers
io.on('connection', async (socket) => {
  const userId = (socket as SocketWithUser).user.userId;
  if (userId) {
    await socket.join(userId);
  }

  // join the user room for notifications
  // needed for logging in manually after signing up
  socket.on('authenticate', () => {
    const userId = (socket as SocketWithUser).user.userId;
    void (async () => {
      try {
        const userWasAlreadyAuthenticated = Array.from(socket.rooms).includes(userId);
        if (userWasAlreadyAuthenticated) return;
        // remove the user from all other rooms
        const rooms = Array.from(socket.rooms);
        for (const room of rooms) {
          if (room !== socket.id) {
            await socket.leave(room);
          }
        }
        await socket.join(userId);
      } catch (error) {
        console.error('Error joining user room:', error);
      }
    })();
  });

  // Join a specific conversation room
  socket.on('join-conversation', (conversationId: string) => {
    const userId = (socket as SocketWithUser).user.userId;
    void (async () => {
      try {
        const conversation = await Conversation.findById(conversationId).lean();
        if (
          !conversation ||
          !conversation.participants.map((p) => p._id.toString()).includes(userId)
        ) {
          console.error(`User ${userId} is not allowed to join conversation ${conversationId}`);
          return;
        }
        await socket.join(conversationId);
      } catch (error) {
        console.error('Error joining conversation:', error);
      }
    })();
  });

  // Leave a conversation room
  socket.on('leave-conversation', (conversationId: string) => {
    void (async () => {
      try {
        await socket.leave(conversationId);
      } catch (error) {
        console.error('Error leaving conversation:', error);
      }
    })();
  });

  socket.on('typing-start', async (conversationId: string) => {
    const userId = (socket as SocketWithUser).user.userId;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation || !conversation.participants.map((p) => p._id.toString()).includes(userId)) {
      console.error(
        `User ${userId} is not allowed to emit typing event in conversation ${conversationId}`,
      );
      return;
    }

    socket.to(conversationId).emit('user-typing', {
      userId: userId,
      timestamp: Date.now(),
    });
  });

  socket.on(
    'conversation-cooperation-update',
    async (data: { cooperation: Cooperation; conversationId: string }) => {
      const { cooperation, conversationId } = data;
      const userId = (socket as SocketWithUser).user.userId;
      const conversation = await Conversation.findById(conversationId).lean();
      if (
        !conversation ||
        !conversation.participants.map((p) => p._id.toString()).includes(userId)
      ) {
        console.error(
          `User ${userId} is not allowed to emit cooperation update in conversation ${conversationId}`,
        );
        return;
      }
      socket.to(conversationId).emit('conversation-cooperation-update', cooperation);
    },
  );

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

export { io, server };
