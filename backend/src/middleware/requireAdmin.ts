import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';
import { db } from '../config/db.js';
import { user } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Middleware that requires authentication AND admin role
 * Must be used after requireAuth or it will fail
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // First ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch user from database to get role
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, req.user.id))
      .limit(1);

    if (!userData.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (userData[0].role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Attach full user data to request
    req.user = { ...req.user, role: userData[0].role };
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Combined middleware that requires both auth and admin
 */
export async function requireAuthAndAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // First run requireAuth
  await requireAuth(req, res, async () => {
    // Then run requireAdmin
    await requireAdmin(req, res, next);
  });
}

