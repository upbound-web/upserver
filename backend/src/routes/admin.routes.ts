import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { db } from '../config/db.js';
import { user, customers, chatSessions, reviewRequests } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ChatService } from '../services/ChatService.js';
import { existsSync } from 'fs';
import { join, normalize } from 'path';

const router: Router = Router();
const sitesRootDir = process.env.SITES_DIR || '/home/jakedawson/upserver/sites';
const parsedDevServerStartPort = parseInt(process.env.DEV_SERVER_START_PORT || '3000', 10);
const devServerStartPort = Number.isFinite(parsedDevServerStartPort)
  ? parsedDevServerStartPort
  : 3000;
const parsedDevServerRangeSize = parseInt(
  process.env.DEV_SERVER_PORT_RANGE_SIZE || '50',
  10
);
const devServerRangeSize = Number.isFinite(parsedDevServerRangeSize)
  ? Math.max(0, parsedDevServerRangeSize)
  : 50;
const parsedDevServerEndPort = parseInt(
  process.env.DEV_SERVER_END_PORT || `${devServerStartPort + devServerRangeSize}`,
  10
);
const devServerEndPort = Number.isFinite(parsedDevServerEndPort)
  ? Math.max(devServerStartPort, parsedDevServerEndPort)
  : devServerStartPort + devServerRangeSize;

function validateSiteFolderPath(siteFolder: string): string | null {
  const trimmed = siteFolder.trim();
  if (!trimmed) return 'siteFolder cannot be empty';

  const normalized = normalize(trimmed);
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized.includes('\\..\\')) {
    return 'siteFolder cannot contain parent directory traversal';
  }

  const folderPath = join(sitesRootDir, normalized);
  if (!existsSync(folderPath)) {
    return `Site folder does not exist on disk: ${folderPath}`;
  }

  return null;
}

async function validateStagingPortUnique(
  stagingPort: number | undefined,
  currentSiteId?: string
): Promise<string | null> {
  if (stagingPort === undefined || stagingPort === null) return null;
  if (!Number.isInteger(stagingPort) || stagingPort <= 0 || stagingPort > 65535) {
    return 'stagingPort must be a valid port number (1-65535)';
  }
  if (stagingPort < devServerStartPort || stagingPort > devServerEndPort) {
    return `stagingPort must be within the allowed tunnel range ${devServerStartPort}-${devServerEndPort}.`;
  }

  const existingWithPort = await db
    .select()
    .from(customers)
    .where(eq(customers.stagingPort, stagingPort))
    .limit(10);

  const conflict = existingWithPort.find((site) => site.id !== currentSiteId);
  if (conflict) {
    return `stagingPort ${stagingPort} is already assigned to another site. Each tunnel-mapped site needs a unique fixed port.`;
  }

  return null;
}

function parseOptionalStagingPort(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

// ========== SITES (Customers) Management ==========

// GET /api/admin/sites - List all sites
router.get('/sites', async (req, res, next) => {
  try {
    const sites = await db
      .select({
        id: customers.id,
        userId: customers.userId,
        name: customers.name,
        siteFolder: customers.siteFolder,
        stagingUrl: customers.stagingUrl,
        githubRepo: customers.githubRepo,
        stagingPort: customers.stagingPort,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(customers)
      .leftJoin(user, eq(customers.userId, user.id))
      .orderBy(desc(customers.createdAt));

    res.json({ sites });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/sites/:id - Get a specific site
router.get('/sites/:id', async (req, res, next) => {
  try {
    const site = await db
      .select({
        id: customers.id,
        userId: customers.userId,
        name: customers.name,
        siteFolder: customers.siteFolder,
        stagingUrl: customers.stagingUrl,
        githubRepo: customers.githubRepo,
        stagingPort: customers.stagingPort,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(customers)
      .leftJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, req.params.id))
      .limit(1);

    if (!site.length) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json({ site: site[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sites - Create a new site
router.post('/sites', async (req, res, next) => {
  try {
    const { userId, name, siteFolder, stagingUrl, githubRepo, stagingPort } = req.body;

    if (!userId || !name || !siteFolder) {
      return res.status(400).json({ error: 'Missing required fields: userId, name, siteFolder' });
    }

    const siteFolderError = validateSiteFolderPath(siteFolder);
    if (siteFolderError) {
      return res.status(400).json({ error: siteFolderError });
    }

    if (stagingUrl && !stagingUrl.toLowerCase().includes('staging')) {
      return res.status(400).json({ error: 'Staging URL must contain the word "staging" (for Cloudflare cache rules)' });
    }

    const parsedStagingPort = parseOptionalStagingPort(stagingPort);
    if (stagingPort !== undefined && stagingPort !== null && stagingPort !== '' && parsedStagingPort === undefined) {
      return res.status(400).json({ error: 'stagingPort must be a valid number' });
    }
    const stagingPortError = await validateStagingPortUnique(parsedStagingPort);
    if (stagingPortError) {
      return res.status(400).json({ error: stagingPortError });
    }

    // Verify user exists
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!existingUser.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if site folder already exists
    const existingSite = await db
      .select()
      .from(customers)
      .where(eq(customers.siteFolder, siteFolder))
      .limit(1);

    if (existingSite.length) {
      return res.status(400).json({ error: 'Site folder already exists' });
    }

    const siteId = nanoid();
    const now = new Date();

    await db.insert(customers).values({
      id: siteId,
      userId,
      name,
      siteFolder,
      stagingUrl: stagingUrl || null,
      githubRepo: githubRepo || null,
      stagingPort: parsedStagingPort ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const newSite = await db
      .select({
        id: customers.id,
        userId: customers.userId,
        name: customers.name,
        siteFolder: customers.siteFolder,
        stagingUrl: customers.stagingUrl,
        githubRepo: customers.githubRepo,
        stagingPort: customers.stagingPort,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(customers)
      .leftJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, siteId))
      .limit(1);

    res.status(201).json({ site: newSite[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/sites/:id - Update a site
router.put('/sites/:id', async (req, res, next) => {
  try {
    const { name, siteFolder, stagingUrl, githubRepo, stagingPort, userId } = req.body;

    // Check if site exists
    const existingSite = await db
      .select()
      .from(customers)
      .where(eq(customers.id, req.params.id))
      .limit(1);

    if (!existingSite.length) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // If userId is being changed, verify new user exists
    if (userId && userId !== existingSite[0].userId) {
      const newUser = await db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (!newUser.length) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    // If siteFolder is being changed, check for conflicts
    if (siteFolder && siteFolder !== existingSite[0].siteFolder) {
      const siteFolderError = validateSiteFolderPath(siteFolder);
      if (siteFolderError) {
        return res.status(400).json({ error: siteFolderError });
      }

      const conflictingSite = await db
        .select()
        .from(customers)
        .where(eq(customers.siteFolder, siteFolder))
        .limit(1);

      if (conflictingSite.length) {
        return res.status(400).json({ error: 'Site folder already exists' });
      }
    }

    if (stagingUrl !== undefined && stagingUrl && !stagingUrl.toLowerCase().includes('staging')) {
      return res.status(400).json({ error: 'Staging URL must contain the word "staging" (for Cloudflare cache rules)' });
    }

    const parsedStagingPort = parseOptionalStagingPort(stagingPort);
    if (stagingPort !== undefined && stagingPort !== null && stagingPort !== '' && parsedStagingPort === undefined) {
      return res.status(400).json({ error: 'stagingPort must be a valid number' });
    }
    if (parsedStagingPort !== undefined) {
      const stagingPortError = await validateStagingPortUnique(
        parsedStagingPort,
        existingSite[0].id
      );
      if (stagingPortError) {
        return res.status(400).json({ error: stagingPortError });
      }
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (siteFolder !== undefined) updateData.siteFolder = siteFolder;
    if (stagingUrl !== undefined) updateData.stagingUrl = stagingUrl || null;
    if (githubRepo !== undefined) updateData.githubRepo = githubRepo || null;
    if (stagingPort !== undefined) updateData.stagingPort = parsedStagingPort ?? null;
    if (userId !== undefined) updateData.userId = userId;

    await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, req.params.id));

    const updatedSite = await db
      .select({
        id: customers.id,
        userId: customers.userId,
        name: customers.name,
        siteFolder: customers.siteFolder,
        stagingUrl: customers.stagingUrl,
        githubRepo: customers.githubRepo,
        stagingPort: customers.stagingPort,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(customers)
      .leftJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, req.params.id))
      .limit(1);

    res.json({ site: updatedSite[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/sites/:id - Delete a site
router.delete('/sites/:id', async (req, res, next) => {
  try {
    const existingSite = await db
      .select()
      .from(customers)
      .where(eq(customers.id, req.params.id))
      .limit(1);

    if (!existingSite.length) {
      return res.status(404).json({ error: 'Site not found' });
    }

    await db.delete(customers).where(eq(customers.id, req.params.id));

    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ========== USERS Management ==========

// GET /api/admin/users - List all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/:id - Get a specific user
router.get('/users/:id', async (req, res, next) => {
  try {
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, req.params.id))
      .limit(1);

    if (!userData.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's sites
    const userSites = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, req.params.id));

    res.json({
      user: userData[0],
      sites: userSites,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users - Create a new user
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Missing required fields: name, email' });
    }

    // Check if email already exists
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser.length) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const userId = nanoid();
    const now = new Date();

    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true, // Admin-created users are pre-verified
      role: role || 'user',
      createdAt: now,
      updatedAt: now,
    });

    const newUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    res.status(201).json({ user: newUser[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id - Update a user
router.put('/users/:id', async (req, res, next) => {
  try {
    const { name, email, role, emailVerified } = req.body;

    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.id, req.params.id))
      .limit(1);

    if (!existingUser.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If email is being changed, check for conflicts
    if (email && email !== existingUser[0].email) {
      const conflictingUser = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (conflictingUser.length) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;

    await db.update(user).set(updateData).where(eq(user.id, req.params.id));

    const updatedUser = await db
      .select()
      .from(user)
      .where(eq(user.id, req.params.id))
      .limit(1);

    res.json({ user: updatedUser[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sites/:id/users - Add a user to a site (create customer record)
router.post('/sites/:id/users', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    // Verify site exists
    const site = await db
      .select()
      .from(customers)
      .where(eq(customers.id, req.params.id))
      .limit(1);

    if (!site.length) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Verify user exists
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userData.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has access to this site (same siteFolder)
    const existingCustomer = await db
      .select()
      .from(customers)
      .where(and(
        eq(customers.siteFolder, site[0].siteFolder),
        eq(customers.userId, userId)
      ))
      .limit(1);

    if (existingCustomer.length) {
      return res.status(400).json({ error: 'User already has access to this site' });
    }

    // Create a new customer record for this user with the same site details
    const newCustomerId = nanoid();
    const now = new Date();

    await db.insert(customers).values({
      id: newCustomerId,
      userId,
      name: userData[0].name, // Use user's name
      siteFolder: site[0].siteFolder,
      stagingUrl: site[0].stagingUrl,
      githubRepo: site[0].githubRepo,
      stagingPort: site[0].stagingPort,
      createdAt: now,
      updatedAt: now,
    });

    const newCustomer = await db
      .select({
        id: customers.id,
        userId: customers.userId,
        name: customers.name,
        siteFolder: customers.siteFolder,
        stagingUrl: customers.stagingUrl,
        githubRepo: customers.githubRepo,
        stagingPort: customers.stagingPort,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(customers)
      .leftJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, newCustomerId))
      .limit(1);

    res.status(201).json({ site: newCustomer[0] });
  } catch (error) {
    next(error);
  }
});

// ========== CHAT Management ==========

// GET /api/admin/users/:id/chats - Get all chat sessions for a user
router.get('/users/:id/chats', async (req, res, next) => {
  try {
    // Verify user exists
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, req.params.id))
      .limit(1);

    if (!userData.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get customer record for this user
    const customer = await ChatService.getCustomerByUserId(req.params.id);

    if (!customer) {
      return res.json({ sessions: [] });
    }

    const sessions = await ChatService.getSessions(customer.id);
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/:id/chats/:sessionId - Get specific chat session with messages
router.get('/users/:id/chats/:sessionId', async (req, res, next) => {
  try {
    // Verify user exists
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, req.params.id))
      .limit(1);

    if (!userData.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get customer record for this user
    const customer = await ChatService.getCustomerByUserId(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found for this user' });
    }

    // Verify session belongs to this customer
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, req.params.sessionId))
      .limit(1);

    if (!session.length || session[0].customerId !== customer.id) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const messages = await ChatService.getSessionMessages(req.params.sessionId);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// ========== REVIEW REQUESTS / QUOTES ==========

// GET /api/admin/reviews - List all review requests for triage/quoting
router.get('/reviews', async (req, res, next) => {
  try {
    const reviews = await db
      .select({
        id: reviewRequests.id,
        customerId: reviewRequests.customerId,
        sessionId: reviewRequests.sessionId,
        requestContent: reviewRequests.requestContent,
        decision: reviewRequests.decision,
        scope: reviewRequests.scope,
        confidencePct: reviewRequests.confidencePct,
        reason: reviewRequests.reason,
        triggers: reviewRequests.triggers,
        quotedPriceCents: reviewRequests.quotedPriceCents,
        quoteNote: reviewRequests.quoteNote,
        quotedAt: reviewRequests.quotedAt,
        approvedAt: reviewRequests.approvedAt,
        status: reviewRequests.status,
        policyVersion: reviewRequests.policyVersion,
        createdAt: reviewRequests.createdAt,
        updatedAt: reviewRequests.updatedAt,
        customer: {
          id: customers.id,
          name: customers.name,
          userId: customers.userId,
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(reviewRequests)
      .leftJoin(customers, eq(reviewRequests.customerId, customers.id))
      .leftJoin(user, eq(customers.userId, user.id))
      .orderBy(desc(reviewRequests.createdAt));

    res.json({ reviews });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/reviews/:id/quote - Add/update single-price quote for a request
router.put('/reviews/:id/quote', async (req, res, next) => {
  try {
    const { priceAud, note } = req.body;
    const parsedPrice = Number(priceAud);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: 'priceAud must be a positive number' });
    }

    const existing = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, req.params.id))
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Review request not found' });
    }

    const now = new Date();
    await db
      .update(reviewRequests)
      .set({
        quotedPriceCents: Math.round(parsedPrice * 100),
        quoteNote: typeof note === 'string' && note.trim() ? note.trim() : null,
        status: 'quoted',
        quotedAt: now,
        updatedAt: now,
      })
      .where(eq(reviewRequests.id, req.params.id));

    const updated = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, req.params.id))
      .limit(1);

    res.json({ review: updated[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/reviews/:id/status - Update request status after quote lifecycle
router.put('/reviews/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body as { status?: string };
    const allowedStatuses = new Set(['open', 'quoted', 'approved', 'rejected', 'completed']);

    if (!status || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const existing = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, req.params.id))
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Review request not found' });
    }

    await db
      .update(reviewRequests)
      .set({
        status: status as 'open' | 'quoted' | 'approved' | 'rejected' | 'completed',
        updatedAt: new Date(),
      })
      .where(eq(reviewRequests.id, req.params.id));

    const updated = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, req.params.id))
      .limit(1);

    res.json({ review: updated[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
