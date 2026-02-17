import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { impersonateUser } from '../middleware/impersonateUser.js';
import { DevServerService } from '../services/DevServerService.js';
import { ChatService } from '../services/ChatService.js';

const router: Router = Router();

// All routes require authentication
router.use(requireAuth);
// Allow admins to impersonate users via userId query param
router.use(impersonateUser);

// GET /api/devserver/status - Get dev server status
router.get('/status', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const status = await DevServerService.getStatus(customer.id);

    if (!status) {
      return res.json({ status: 'not_started' });
    }

    res.json({ status });
  } catch (error) {
    next(error);
  }
});

// GET /api/devserver/preflight - Readiness checks for customer staging workflow
router.get('/preflight', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const preflight = await DevServerService.getPreflight(customer.id);
    res.json(preflight);
  } catch (error) {
    next(error);
  }
});

// POST /api/devserver/start - Start dev server
router.post('/start', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await DevServerService.start(customer.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/devserver/stop - Stop dev server
router.post('/stop', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await DevServerService.stop(customer.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
