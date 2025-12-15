import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { PublishService } from '../services/PublishService.js';
import { ChatService } from '../services/ChatService.js';

const router = Router();

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

export default router;
