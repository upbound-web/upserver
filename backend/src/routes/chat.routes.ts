import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { impersonateUser } from '../middleware/impersonateUser.js';
import { ChatService } from '../services/ChatService.js';
import { ImageUploadService } from '../services/ImageUploadService.js';
import { join, resolve, relative } from 'path';
import { readFile } from 'fs/promises';
import { access } from 'fs/promises';

const router: Router = Router();

// Configure multer for memory storage (we'll write files manually)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only jpg, png, webp, and svg are allowed.'));
    }
  },
});

// All routes require authentication
router.use(requireAuth);
// Allow admins to impersonate users via userId query param
router.use(impersonateUser);

// GET /api/chat/sessions - Get all chat sessions for the customer
router.get('/sessions', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const sessions = await ChatService.getSessions(customer.id);
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

// POST /api/chat/sessions - Create a new chat session
router.post('/sessions', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const session = await ChatService.createSession(customer.id);
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/sessions/:id - Get a specific session with messages
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const messages = await ChatService.getSessionMessages(req.params.id);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// POST /api/chat/sessions/:id/messages - Send a message in a session
// Support both JSON (text-only) and multipart/form-data (with images)
router.post('/sessions/:id/messages', (req, res, next) => {
  // Check if request is multipart/form-data
  const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
  
  if (isMultipart) {
    // Use multer middleware for multipart requests
    upload.array('images', 10)(req, res, next);
  } else {
    // For JSON requests, Express JSON middleware will parse it
    next();
  }
}, async (req, res, next) => {
  try {
    // Extract content - from req.body (either JSON or form-data)
    const content = req.body?.content || req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Handle image uploads if present
    let imagePaths: string[] | undefined;
    const files = req.files as Express.Multer.File[];
    
    if (files && files.length > 0) {
      const sitePath = join(
        process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
        customer.siteFolder
      );
      imagePaths = await ImageUploadService.saveImages(files, sitePath);
    }

    const message = await ChatService.sendMessage(
      req.params.id,
      customer.id,
      content,
      imagePaths
    );

    res.json({ message });
  } catch (error) {
    next(error);
  }
});

// POST /api/chat/sessions/:id/messages/stream - Stream a message response via SSE
router.post('/sessions/:id/messages/stream', async (req, res, next) => {
  try {
    const content = req.body?.content || req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Flush headers
    // @ts-ignore - flushHeaders may not exist depending on runtime
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    // Helper to send an SSE event
    const sendEvent = (event: string, data: unknown) => {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    };

    // Immediately send a ping so the client knows the stream is open
    sendEvent('open', { ok: true });

    try {
      for await (const event of ChatService.sendMessageStream(
        req.params.id,
        customer.id,
        content
      )) {
        if (event.type === 'text') {
          sendEvent('text', { text: event.text });
        } else if (event.type === 'error') {
          sendEvent('error', { message: event.message });
          res.end();
          return;
        } else if (event.type === 'done') {
          sendEvent('done', {
            flagged: event.flagged,
            filesModified: event.filesModified || [],
            claudeSessionId: event.claudeSessionId,
          });
          res.end();
          return;
        }
      }
    } catch (streamError) {
      console.error('Streaming route error:', streamError);
      sendEvent('error', {
        message:
          "I'm having trouble processing your request right now. Please try again or contact support if the issue persists.",
      });
      res.end();
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/images/* - Serve images from customer's site folder
// Use a route matcher function to match any path starting with /images/
router.get(/^\/images\/.+$/, async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Extract the full path from the original URL
    // req.originalUrl will be "/api/chat/images/public/uploads/file.jpg"
    const match = req.originalUrl.match(/\/api\/chat\/images\/(.+)$/);
    if (!match || !match[1]) {
      return res.status(400).json({ error: 'Invalid image path' });
    }
    
    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(match[1]);
    
    // Ensure the path is within public/uploads for security
    if (!decodedPath.startsWith('public/uploads/')) {
      return res.status(403).json({ error: 'Invalid image path' });
    }

    const sitePath = join(
      process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
      customer.siteFolder
    );

    // Resolve the full path
    const fullPath = resolve(sitePath, decodedPath);
    const relativePath = relative(sitePath, fullPath);

    // Security check: ensure the resolved path is within the site directory
    if (relativePath.startsWith('..') || !relativePath.startsWith('public/uploads/')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Read and serve the file
    const fileBuffer = await readFile(fullPath);
    
    // Determine content type from file extension
    const ext = decodedPath.toLowerCase().match(/\.[^.]+$/)?.[0];
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = contentTypeMap[ext || ''] || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

export default router;
