import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { PublishService } from '../services/PublishService.js';
import { ChatService } from '../services/ChatService.js';

const router: Router = Router();

// All routes require authentication
router.use(requireAuth);

// POST /api/publish - Publish changes to production
router.post('/', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await PublishService.publish(customer.siteFolder);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/publish/status - Get last publish info
router.get('/status', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const lastPublish = await PublishService.getLastPublish(customer.siteFolder);

    if (!lastPublish) {
      return res.json({ message: 'No previous publishes found' });
    }

    res.json({ lastPublish });
  } catch (error) {
    next(error);
  }
});

// GET /api/publish/history - Get last 10 publish/commit points for rollback choices
router.get('/history', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const history = await PublishService.getPublishHistory(customer.siteFolder, 10);
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// POST /api/publish/rollback - Roll back to a selected commit hash
router.post('/rollback', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { commitHash } = req.body as { commitHash?: string };
    if (!commitHash) {
      return res.status(400).json({ error: 'commitHash is required' });
    }

    const result = await PublishService.rollbackToCommit(customer.siteFolder, commitHash);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
