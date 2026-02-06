import {
  createConsumer,
  withRetry,
  withLogging,
  EVENT_TYPES,
} from '@clipdeck/events';
import type {
  EventConsumer,
  ClipApprovedPayload,
  ClipRejectedPayload,
  CampaignStatusChangedPayload,
  CampaignEndedPayload,
  PayoutCompletedPayload,
  DisputeResolvedPayload,
  DisputeCreatedPayload,
} from '@clipdeck/events';
import { config } from '../config';
import { logger } from '../lib/logger';
import * as notificationService from '../services/notificationService';

// ============================================================================
// Event Consumer Setup
// ============================================================================

export function createNotificationConsumer(): EventConsumer {
  const consumer = createConsumer({
    serviceName: 'notification-service',
    connectionUrl: config.rabbitmqUrl,
    exchange: config.eventExchange,
    queueName: 'notification.events',
    routingKeys: [
      'clip.approved',
      'clip.rejected',
      'campaign.status_changed',
      'campaign.ended',
      'payment.payout_completed',
      'dispute.resolved',
      'dispute.created',
    ],
    enableLogging: true,
    logger: {
      info: (msg, data) => logger.info(data, msg),
      error: (msg, err) => logger.error(err, msg),
      debug: (msg, data) => logger.debug(data, msg),
    },
  });

  // ============================================================================
  // Clip Approved Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.CLIP_APPROVED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as ClipApprovedPayload;
        await notificationService.createNotification(
          payload.userId,
          'CLIP_APPROVED',
          'Clip Approved',
          `Your clip has been approved! You earned $${(payload.paymentAmount / 100).toFixed(2)}.`,
          undefined,
          {
            clipId: payload.clipId,
            campaignId: payload.campaignId,
            paymentAmount: payload.paymentAmount,
          }
        );
        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Clip Rejected Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.CLIP_REJECTED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as ClipRejectedPayload;
        await notificationService.createNotification(
          payload.userId,
          'CLIP_REJECTED',
          'Clip Rejected',
          `Your clip was rejected. Reason: ${payload.reason}`,
          undefined,
          {
            clipId: payload.clipId,
            campaignId: payload.campaignId,
            reason: payload.reason,
          }
        );
        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Campaign Status Changed Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.CAMPAIGN_STATUS_CHANGED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as CampaignStatusChangedPayload;

        // Only notify on specific status transitions
        if (payload.newStatus === 'PAUSED') {
          // If the campaign was paused, we might notify the owner
          if (payload.changedBy) {
            await notificationService.createNotification(
              payload.changedBy,
              'CAMPAIGN_ENDING',
              'Campaign Paused',
              `Campaign has been paused.`,
              undefined,
              {
                campaignId: payload.campaignId,
                oldStatus: payload.oldStatus,
                newStatus: payload.newStatus,
              }
            );
          }
        }

        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Campaign Ended Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.CAMPAIGN_ENDED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as CampaignEndedPayload;
        // Create a system notification — the campaign owner would be resolved
        // via the campaign data; for now we store the metadata
        await notificationService.createSystemNotification(
          'system',
          'Campaign Ended',
          `Campaign ended (${payload.endReason}). Total clips: ${payload.totalClips}, Total views: ${payload.totalViews}.`
        );

        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Payout Completed Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.PAYOUT_COMPLETED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as PayoutCompletedPayload;
        await notificationService.createNotification(
          payload.userId,
          'PAYMENT_COMPLETED',
          'Payment Completed',
          `Your payout of $${(payload.amount / 100).toFixed(2)} has been completed.`,
          undefined,
          {
            payoutId: payload.payoutId,
            amount: payload.amount,
            transactionHash: payload.transactionHash,
          }
        );
        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Dispute Created Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.DISPUTE_CREATED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as DisputeCreatedPayload;
        await notificationService.createNotification(
          payload.userId,
          'SYSTEM_ALERT',
          'Dispute Created',
          `Your dispute has been submitted and is under review.`,
          undefined,
          {
            disputeId: payload.disputeId,
            clipId: payload.clipId,
            campaignId: payload.campaignId,
          }
        );
        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  // ============================================================================
  // Dispute Resolved Handler
  // ============================================================================

  consumer.on(
    EVENT_TYPES.DISPUTE_RESOLVED,
    withRetry(
      withLogging(async (event, context) => {
        const payload = event.payload as DisputeResolvedPayload;
        const statusLabel = payload.status === 'RESOLVED' ? 'resolved in your favor' : 'rejected';
        await notificationService.createNotification(
          payload.userId,
          'SYSTEM_ALERT',
          'Dispute Resolved',
          `Your dispute has been ${statusLabel}. Resolution: ${payload.resolution}`,
          undefined,
          {
            disputeId: payload.disputeId,
            clipId: payload.clipId,
            status: payload.status,
            resolution: payload.resolution,
          }
        );
        await context.ack();
      }, { info: (msg, data) => logger.info(data, msg) })
    )
  );

  return consumer;
}
