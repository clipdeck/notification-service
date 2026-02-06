import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validation';
import { sendError } from '../lib/errors';
import * as notificationService from '../services/notificationService';

// ============================================================================
// Schemas
// ============================================================================

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const markReadBodySchema = z.object({
  notificationId: z.string().optional(),
  markAll: z.boolean().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications - List notifications for auth user
  app.get('/', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const query = validateQuery(listQuerySchema, request.query);
      const result = await notificationService.getNotifications(
        user.userId,
        query.limit,
        query.offset
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /notifications/unread-count - Get unread count
  app.get('/unread-count', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const result = await notificationService.getUnreadCount(user.userId);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /notifications/mark-read - Mark notification(s) as read
  app.post('/mark-read', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const body = validateBody(markReadBodySchema, request.body);

      if (body.markAll) {
        const result = await notificationService.markAllAsRead(user.userId);
        return result;
      }

      if (body.notificationId) {
        const result = await notificationService.markAsRead(user.userId, body.notificationId);
        return result;
      }

      return { message: 'No action taken. Provide notificationId or markAll: true.' };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // DELETE /notifications/:id - Delete notification
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = requireAuth(request);
      await notificationService.deleteNotification(user.userId, request.params.id);
      reply.status(204).send();
    } catch (error) {
      sendError(reply, error);
    }
  });
}
