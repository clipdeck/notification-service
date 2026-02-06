import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config';
import { logger } from './lib/logger';
import { notificationRoutes } from './routes/notifications';
import { publisher } from './lib/events';
import { createNotificationConsumer } from './events/handlers';

async function main() {
  const app = Fastify({
    logger: logger as any,
  });

  // Plugins
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  });
  await app.register(helmet);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));
  app.get('/ready', async () => {
    // Could add DB connectivity check here
    return { status: 'ready', service: 'notification-service' };
  });

  // Routes
  await app.register(notificationRoutes, { prefix: '/notifications' });

  // Connect event publisher
  await publisher.connect();

  // Start event consumer
  const consumer = createNotificationConsumer();
  await consumer.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await consumer.stop();
    await publisher.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  await app.listen({ port: config.port, host: config.host });
  logger.info(`Notification service listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  logger.error(err, 'Failed to start notification service');
  process.exit(1);
});
