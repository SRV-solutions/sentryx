/** Validaciones (zod) de notificaciones. */
import { z } from 'zod';

const broadcastBody = z.object({
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
  type: z.string().min(1).max(40),
  link: z.string().max(500).optional(),
});

/** PATCH /notifications/:notificationId */
export const markAsRead = { params: z.object({ notificationId: z.coerce.number().int().positive() }) };

/** POST /notifications/all */
export const sendToAll = { body: broadcastBody };

/** POST /notifications/user */
export const sendToUser = { body: broadcastBody.extend({ userId: z.number().int() }) };

/** POST /notifications/some */
export const sendToUsers = { body: broadcastBody.extend({ userIds: z.array(z.number().int()).min(1).max(5000) }) };
