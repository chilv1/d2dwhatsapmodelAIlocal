/**
 * Telecom Big Campaign Bot — entry point.
 * Khởi động đồng thời: WhatsApp client (whatsapp-web.js) + Express admin API.
 */
import { config } from './src/config.js';
import { logger } from './src/logger.js';
import { startWhatsApp, stopWhatsApp } from './src/wa.js';
import { createAdminApp } from './src/admin.js';

async function main() {
  logger.info(
    {
      visionModel: config.visionModel,
      replyMode: config.replyMode,
      adminPort: config.adminPort,
      sessionDir: config.waSessionDir,
    },
    '🚀 Starting Telecom Big Campaign Bot',
  );

  // Express admin server
  const app = createAdminApp();
  const server = app.listen(config.adminPort, () => {
    logger.info(`✓ Admin server: http://localhost:${config.adminPort}`);
  });

  // WhatsApp client (sẽ in QR ra terminal lần đầu)
  await startWhatsApp();

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');
    server.close();
    await stopWhatsApp();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Fatal startup error');
  process.exit(1);
});
