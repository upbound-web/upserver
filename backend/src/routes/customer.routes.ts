import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { impersonateUser } from '../middleware/impersonateUser.js';
import { ChatService } from '../services/ChatService.js';
import { db } from '../config/db.js';
import { reviewRequests } from '../db/schema.js';
import { and, desc, eq } from 'drizzle-orm';

const router: Router = Router();

// All routes require authentication
router.use(requireAuth);
// Allow admins to impersonate users via userId query param
router.use(impersonateUser);

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

// GET /api/customer/review-requests - List flagged/quoted requests for this customer
router.get('/review-requests', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const requests = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.customerId, customer.id))
      .orderBy(desc(reviewRequests.createdAt));

    res.json({ reviewRequests: requests });
  } catch (error) {
    next(error);
  }
});

// POST /api/customer/review-requests/:id/approve - Customer approves a quoted request
router.post('/review-requests/:id/approve', async (req, res, next) => {
  try {
    const customer = await ChatService.getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const existing = await db
      .select()
      .from(reviewRequests)
      .where(
        and(
          eq(reviewRequests.id, req.params.id),
          eq(reviewRequests.customerId, customer.id)
        )
      )
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Review request not found' });
    }

    if (existing[0].status !== 'quoted') {
      return res.status(400).json({ error: 'Only quoted requests can be approved' });
    }

    await db
      .update(reviewRequests)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviewRequests.id, req.params.id));

    const updated = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, req.params.id))
      .limit(1);

    res.json({ reviewRequest: updated[0] });
  } catch (error) {
    next(error);
  }
});

export default router;




