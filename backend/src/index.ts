import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import chatRoutes from './routes/chat.routes.js';
import devserverRoutes from './routes/devserver.routes.js';
import publishRoutes from './routes/publish.routes.js';
import customerRoutes from './routes/customer.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { DevServerService } from './services/DevServerService.js';

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Mount Better Auth at /api/auth
app.use('/api/auth', toNodeHandler(auth));

// Mount custom routes
app.use('/api/chat', chatRoutes);
app.use('/api/devserver', devserverRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 UpServer Backend Started');
  console.log('='.repeat(60));
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`Sites Directory: ${process.env.SITES_DIR || '/home/jakedawson/upserver/sites'}`);
  console.log('='.repeat(60) + '\n');
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/auth/email-otp/send-verification-otp');
  console.log('  POST /api/auth/sign-in/email-otp');
  console.log('  POST /api/auth/email-otp/verify-email');
  console.log('  GET  /api/chat/sessions');
  console.log('  POST /api/chat/sessions');
  console.log('  POST /api/chat/sessions/:id/messages');
  console.log('  GET  /api/devserver/status');
  console.log('  POST /api/devserver/start');
  console.log('  POST /api/devserver/stop');
  console.log('  POST /api/publish');
  console.log('  GET  /api/publish/status');
  console.log('='.repeat(60) + '\n');
});

// Schedule cleanup job (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(async () => {
  try {
    console.log('Running dev server cleanup...');
    await DevServerService.cleanupInactive();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, CLEANUP_INTERVAL);

console.log(`Dev server cleanup scheduled every ${CLEANUP_INTERVAL / 1000 / 60} minutes`);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  process.exit(0);
});
