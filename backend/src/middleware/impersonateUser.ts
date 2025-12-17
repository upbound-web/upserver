import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db.js';
import { user } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Middleware that allows admins to impersonate other users via userId query parameter
 * Must be used after requireAuth to ensure req.user is set
 * 
 * If the requester is an admin and a userId query param is provided:
 * - Validates the target user exists
 * - Temporarily overrides req.user.id with the target user's ID
 * - Preserves the admin role in req.user for authorization checks
 * - Stores original user ID in req.user.originalId
 */
export async function impersonateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Must be authenticated first
    if (!req.user) {
      return next();
    }

    // Check if userId query parameter is provided
    const targetUserId = req.query.userId as string | undefined;
    
    if (!targetUserId) {
      // No impersonation requested, proceed normally
      return next();
    }

    // Fetch requester's user data to check if they're an admin
    const requesterData = await db
      .select()
      .from(user)
      .where(eq(user.id, req.user.id))
      .limit(1);

    if (!requesterData.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Only admins can impersonate
    if (requesterData[0].role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required for impersonation' });
    }

    // Prevent admins from impersonating other admins (security measure)
    const targetUserData = await db
      .select()
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    if (!targetUserData.length) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (targetUserData[0].role === 'admin') {
      return res.status(403).json({ error: 'Cannot impersonate other admin users' });
    }

    // Store original user info and override with target user
    req.user = {
      ...req.user,
      originalId: req.user.id,
      originalRole: requesterData[0].role,
      id: targetUserId, // Override with target user's ID
      role: requesterData[0].role, // Preserve admin role for authorization
    };

    next();
  } catch (error) {
    console.error('Impersonation middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

