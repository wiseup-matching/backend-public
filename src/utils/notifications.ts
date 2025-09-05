import { NotificationFromJSON } from '../api/openapi-client/index.js';
import { NotificationInsertType, User } from '../db/schema.js';
import { sendNotificationEmail } from '../services/mailer.js';
import { io } from './socket.js';

// Notifies a user
// 1. Adds a notification to the user's notifications array in the database
// 2. Emits the notification to the user via WebSocket
// 3. If the user is not online / connected, sends an email notification
export async function notifyUser(
  userId: string,
  notification: Omit<NotificationInsertType, 'timestamp'>,
): Promise<void> {
  const user = await User.findById(userId).exec();
  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }
  // Add the notification to the user's notifications array
  user.notifications.push(notification);
  const newUser = await user.save();
  const notificationWithId = newUser.notifications[newUser.notifications.length - 1].toJSON();

  // Emit the notification to the specific user
  io.to(userId)
    .timeout(1000)
    .emit('notification', NotificationFromJSON(notificationWithId), (err, response: unknown[]) => {
      if (err || response.length === 0) {
        // If the user is not online / connected, we can still send an email
        sendNotificationEmail(user.email, { ...notification, timestamp: new Date() }).catch(
          (error: unknown) => {
            console.error(
              `Error sending notification email to user ${user._id.toString()}:`,
              error,
            );
          },
        );
      }
    });
}
