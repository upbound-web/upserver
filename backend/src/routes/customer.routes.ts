import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { ChatService } from '../services/ChatService.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/customer/me - Get the current customer's info (staging URL/port, site folder, etc.)
router.get('/me', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

export default router;





