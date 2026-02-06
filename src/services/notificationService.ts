import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../lib/errors';
import { logger } from '../lib/logger';
import type { NotificationType, Prisma } from '@prisma/client';

// ============================================================================
// Create Notification
// ============================================================================

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message?: string,
  link?: string,
  metadata?: Record<string, unknown>
) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message: message ?? null,
      link: link ?? null,
      metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  logger.info({ notificationId: notification.id, userId, type }, 'Notification created');
  return notification;
}

// ============================================================================
// Create System Notification (helper)
// ============================================================================

export async function createSystemNotification(
  userId: string,
  title: string,
  message: string
) {
  return createNotification(userId, 'SYSTEM_ALERT', title, message);
}

// ============================================================================
// Get Notifications (paginated)
// ============================================================================

export async function getNotifications(
  userId: string,
  limit = 20,
  offset = 0
) {
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({
      where: { userId },
    }),
  ]);

  return {
    notifications,
    total,
    limit,
    offset,
  };
}

// ============================================================================
// Get Unread Count
// ============================================================================

export async function getUnreadCount(userId: string) {
  const count = await prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });

  return { count };
}

// ============================================================================
// Mark as Read
// ============================================================================

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw notFound('Notification not found');
  }

  if (notification.userId !== userId) {
    throw forbidden('Cannot mark another user\'s notification as read');
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return updated;
}

// ============================================================================
// Mark All as Read
// ============================================================================

export async function markAllAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: { isRead: true },
  });

  logger.info({ userId, count: result.count }, 'Marked all notifications as read');
  return { count: result.count };
}

// ============================================================================
// Delete Notification
// ============================================================================

export async function deleteNotification(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw notFound('Notification not found');
  }

  if (notification.userId !== userId) {
    throw forbidden('Cannot delete another user\'s notification');
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  logger.info({ notificationId, userId }, 'Notification deleted');
}
