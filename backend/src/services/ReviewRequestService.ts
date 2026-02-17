import { nanoid } from "nanoid";
import { db } from "../config/db.js";
import { reviewRequests } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { TriageResult } from "./RequestTriageService.js";

interface CreateReviewRequestInput {
  customerId: string;
  sessionId: string;
  customerMessageId: string;
  assistantMessageId: string;
  requestContent: string;
  triage: TriageResult;
}

export class ReviewRequestService {
  static async createFromTriage(input: CreateReviewRequestInput) {
    const id = nanoid();
    const now = new Date();

    await db.insert(reviewRequests).values({
      id,
      customerId: input.customerId,
      sessionId: input.sessionId,
      customerMessageId: input.customerMessageId,
      assistantMessageId: input.assistantMessageId,
      requestContent: input.requestContent,
      decision: input.triage.decision,
      scope: input.triage.scope,
      confidencePct: Math.max(0, Math.min(100, Math.round(input.triage.confidence * 100))),
      reason: input.triage.reason,
      triggers: JSON.stringify(input.triage.triggers),
      policyVersion: input.triage.policyVersion,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    const created = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, id))
      .limit(1);

    return created[0] || null;
  }
}
