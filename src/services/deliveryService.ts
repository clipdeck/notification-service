import axios from 'axios';
import { config } from '../config';
import { logger } from '../lib/logger';
import * as notificationService from './notificationService';
import type { NotificationType } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export type DeliveryChannel = 'in_app' | 'discord';

export interface DeliveryPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Multi-Channel Delivery
// ============================================================================

export async function deliver(
  payload: DeliveryPayload,
  channels: DeliveryChannel[]
) {
  const results: { channel: DeliveryChannel; success: boolean; error?: string }[] = [];

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'in_app':
          await deliverInApp(payload);
          results.push({ channel, success: true });
          break;

        case 'discord':
          await deliverDiscord(payload);
          results.push({ channel, success: true });
          break;

        default:
          logger.warn({ channel }, 'Unknown delivery channel');
          results.push({ channel, success: false, error: 'Unknown channel' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ channel, error: errorMessage, userId: payload.userId }, 'Delivery failed');
      results.push({ channel, success: false, error: errorMessage });
    }
  }

  return results;
}

// ============================================================================
// In-App Delivery (save to DB)
// ============================================================================

async function deliverInApp(payload: DeliveryPayload) {
  await notificationService.createNotification(
    payload.userId,
    payload.type,
    payload.title,
    payload.message,
    payload.link,
    payload.metadata
  );

  logger.debug({ userId: payload.userId, type: payload.type }, 'In-app notification delivered');
}

// ============================================================================
// Discord Delivery (call discord-service HTTP API)
// ============================================================================

async function deliverDiscord(payload: DeliveryPayload) {
  if (!config.discordServiceUrl) {
    logger.warn('Discord service URL not configured, skipping discord delivery');
    return;
  }

  try {
    await axios.post(`${config.discordServiceUrl}/messages/dm`, {
      userId: payload.userId,
      embed: {
        title: payload.title,
        description: payload.message || '',
        color: getColorForType(payload.type),
        fields: payload.link
          ? [{ name: 'Link', value: payload.link, inline: false }]
          : undefined,
      },
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.debug({ userId: payload.userId, type: payload.type }, 'Discord notification delivered');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, userId: payload.userId }, 'Failed to deliver discord notification');
    throw new Error(`Discord delivery failed: ${message}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getColorForType(type: NotificationType): number {
  switch (type) {
    case 'CLIP_APPROVED':
    case 'CAMPAIGN_ACCEPTED':
    case 'PAYMENT_COMPLETED':
    case 'PAYMENT_CREDITED':
      return 0x22c55e; // green

    case 'CLIP_REJECTED':
    case 'CAMPAIGN_REJECTED':
    case 'PAYMENT_ERROR':
      return 0xef4444; // red

    case 'CAMPAIGN_ENDING':
    case 'CAMPAIGN_ENDED':
    case 'PAYMENT_PROCESSING':
      return 0xf59e0b; // amber

    case 'NEW_CAMPAIGN':
    case 'STUDIO_INVITE':
    case 'CLIP_MILESTONE':
      return 0x3b82f6; // blue

    case 'SYSTEM_ALERT':
    case 'DISCORD_DISCONNECTED':
    case 'WALLET_NOT_CONFIGURED':
    case 'PROFILE_INCOMPLETE':
    default:
      return 0x6b7280; // gray
  }
}
