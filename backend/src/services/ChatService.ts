import { db } from '../config/db.js';
import { chatSessions, messages, customers } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ClaudeAgentService } from './ClaudeAgentService.js';
import { NotificationService } from './NotificationService.js';
import { RequestTriageService } from './RequestTriageService.js';
import { ReviewRequestService } from './ReviewRequestService.js';

export class ChatService {
  static async createSession(customerId: string) {
    const id = nanoid();
    const now = new Date();

    await db.insert(chatSessions).values({
      id,
      customerId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const session = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    return session[0];
  }

  static async getSessions(customerId: string) {
    return db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.customerId, customerId))
      .orderBy(desc(chatSessions.updatedAt));
  }

  static async getSessionMessages(sessionId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);
  }

  static async getSessionMessagesForCustomer(sessionId: string, customerId: string) {
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session.length || session[0].customerId !== customerId) {
      return null;
    }

    return this.getSessionMessages(sessionId);
  }

  static async sendMessage(
    sessionId: string,
    customerId: string,
    content: string,
    imagePaths?: string[]
  ) {
    // Verify session belongs to customer and get claudeSessionId
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session.length || session[0].customerId !== customerId) {
      throw new Error('Session not found or unauthorized');
    }

    const chatSession = session[0];
    const claudeSessionId = chatSession.claudeSessionId || undefined;

    // Set title if it's the first message
    if (!chatSession.title) {
      const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
      await db.update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId));
    }



    // Store customer message
    const msgId = nanoid();
    await db.insert(messages).values({
      id: msgId,
      sessionId,
      role: 'customer',
      content,
      images: imagePaths && imagePaths.length > 0 ? JSON.stringify(imagePaths) : null,
      flagged: false,
      createdAt: new Date(),
    });

    // Get customer details for Claude
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData.length) {
      throw new Error('Customer not found');
    }

    const customer = customerData[0];

    // Get conversation history (only needed for logging/records, SDK handles it when resuming)
    const history = await this.getSessionMessages(sessionId);
    const conversationHistory = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Call Claude Agent Service with claudeSessionId
    const {
      response,
      filesModified,
      claudeSessionId: returnedSessionId,
      agentCompletedSuccessfully,
      agentHadError,
    } = await ClaudeAgentService.processRequest(
      customerId,
      customer.siteFolder,
      content,
      conversationHistory,
      claudeSessionId,
      imagePaths
    );

    const triage = RequestTriageService.evaluate({
      request: content,
      filesModified,
      agentCompletedSuccessfully,
      agentHadError,
    });
    const flagged = triage.decision === 'flag';

    // Update session with claudeSessionId if it was returned (for new sessions)
    if (returnedSessionId && returnedSessionId !== claudeSessionId) {
      await db
        .update(chatSessions)
        .set({
          claudeSessionId: returnedSessionId,
          updatedAt: new Date()
        })
        .where(eq(chatSessions.id, sessionId));
    }

    // Store Claude's response
    const responseId = nanoid();
    await db.insert(messages).values({
      id: responseId,
      sessionId,
      role: 'assistant',
      content: response,
      flagged,
      createdAt: new Date(),
    });

    if (flagged) {
      await ReviewRequestService.createFromTriage({
        customerId: customer.id,
        sessionId,
        customerMessageId: msgId,
        assistantMessageId: responseId,
        requestContent: content,
        triage,
      });
    }

    // Notify developer if flagged
    if (flagged) {
      NotificationService.notifyFlaggedRequest({
        customerName: customer.name,
        customerId: customer.id,
        request: content,
        sessionId,
      }).catch((err) => console.error('Notification error:', err));
    }

    // Update session timestamp (already done above if claudeSessionId was updated)
    if (!returnedSessionId || returnedSessionId === claudeSessionId) {
      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
    }

    const responseMessage = await db
      .select()
      .from(messages)
      .where(eq(messages.id, responseId))
      .limit(1);

    return responseMessage[0];
  }

  /**
   * Streaming variant of sendMessage. Yields incremental assistant text
   * while still persisting the final message and session metadata.
   */
  static async *sendMessageStream(
    sessionId: string,
    customerId: string,
    content: string,
    imagePaths?: string[]
  ): AsyncGenerator<
    | { type: 'text'; text: string }
    | {
      type: 'done';
      flagged: boolean;
      filesModified?: string[];
      claudeSessionId?: string;
    }
    | { type: 'error'; message: string },
    void,
    void
  > {
    // Verify session belongs to customer and get claudeSessionId
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session.length || session[0].customerId !== customerId) {
      yield {
        type: 'error',
        message: 'Session not found or unauthorized',
      };
      return;
    }

    const chatSession = session[0];
    const claudeSessionId = chatSession.claudeSessionId || undefined;

    // Set title if it's the first message
    if (!chatSession.title) {
      const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
      await db.update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId));
    }

    // Store customer message
    const msgId = nanoid();
    await db.insert(messages).values({
      id: msgId,
      sessionId,
      role: 'customer',
      content,
      images: imagePaths && imagePaths.length > 0 ? JSON.stringify(imagePaths) : null,
      flagged: false,
      createdAt: new Date(),
    });

    // Get customer details for Claude
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData.length) {
      yield {
        type: 'error',
        message: 'Customer not found',
      };
      return;
    }

    const customer = customerData[0];

    // Get conversation history (only needed for logging/records, SDK handles it when resuming)
    const history = await this.getSessionMessages(sessionId);
    const conversationHistory = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const responseMessages: string[] = [];
    const filesModified: string[] = [];
    let agentCompletedSuccessfully = false;
    let agentHadError = false;
    let returnedSessionId: string | undefined = claudeSessionId;

    try {
      for await (const event of ClaudeAgentService.streamRequest(
        customerId,
        customer.siteFolder,
        content,
        conversationHistory,
        claudeSessionId,
        imagePaths
      )) {
        if (event.type === 'init' && event.sessionId) {
          returnedSessionId = event.sessionId;
        } else if (event.type === 'text') {
          responseMessages.push(event.text);
          // Stream the text chunk to caller
          yield { type: 'text', text: event.text };
        } else if (event.type === 'fileEdit') {
          filesModified.push(event.path);
        } else if (event.type === 'result') {
          if (event.subtype === 'success') {
            agentCompletedSuccessfully = true;
          } else {
            responseMessages.push(
              '\n\nNote: The task encountered some issues and may need review.'
            );
          }
        } else if (event.type === 'error') {
          agentHadError = true;
          responseMessages.push(event.message);
          // Forward error to caller and stop streaming
          yield { type: 'error', message: event.message };
          break;
        }
      }

      const fullResponse =
        responseMessages.join('\n\n') ||
        'Request processed, but no response was generated.';
      const triage = RequestTriageService.evaluate({
        request: content,
        filesModified,
        agentCompletedSuccessfully,
        agentHadError,
      });
      const flagged = triage.decision === 'flag';

      // Update session with claudeSessionId if it was returned (for new sessions)
      if (returnedSessionId && returnedSessionId !== claudeSessionId) {
        await db
          .update(chatSessions)
          .set({
            claudeSessionId: returnedSessionId,
            updatedAt: new Date(),
          })
          .where(eq(chatSessions.id, sessionId));
      }

      // Store Claude's response
      const responseId = nanoid();
      await db.insert(messages).values({
        id: responseId,
        sessionId,
        role: 'assistant',
        content: fullResponse,
        flagged,
        createdAt: new Date(),
      });

      if (flagged) {
        await ReviewRequestService.createFromTriage({
          customerId: customer.id,
          sessionId,
          customerMessageId: msgId,
          assistantMessageId: responseId,
          requestContent: content,
          triage,
        });
      }

      // Notify developer if flagged
      if (flagged) {
        await NotificationService.notifyFlaggedRequest({
          customerName: customer.name,
          customerId: customer.id,
          request: content,
          sessionId,
        }).catch((err) => console.error('Notification error:', err));
      }

      // Update session timestamp (already done above if claudeSessionId was updated)
      if (!returnedSessionId || returnedSessionId === claudeSessionId) {
        await db
          .update(chatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(chatSessions.id, sessionId));
      }

      yield {
        type: 'done',
        flagged,
        filesModified: filesModified.length > 0 ? filesModified : undefined,
        claudeSessionId: returnedSessionId,
      };
    } catch (error) {
      console.error('ChatService.sendMessageStream error:', error);
      yield {
        type: 'error',
        message:
          "I'm having trouble processing your request right now. Please try again or contact support if the issue persists.",
      };
    }
  }

  static async getCustomerByUserId(userId: string) {
    const result = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, userId))
      .limit(1);

    return result[0] || null;
  }
}
