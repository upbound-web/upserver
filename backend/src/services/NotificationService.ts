interface NotificationPayload {
  title: string;
  text: string;
}

export class NotificationService {
  private static slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  private static async sendSlack(payload: NotificationPayload) {
    if (!this.slackWebhookUrl) {
      console.log('[Notification] Slack webhook not configured. Skipping.', payload);
      return;
    }

    try {
      await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${payload.title}*\n${payload.text}`,
        }),
      });
    } catch (error) {
      console.error('[Notification] Failed to send Slack notification', error);
    }
  }

  static async notifyFlaggedRequest(params: {
    customerName?: string;
    customerId: string;
    request: string;
    sessionId: string;
  }) {
    const title = '🚩 Request flagged for review';
    const text =
      `Customer: ${params.customerName || params.customerId}\n` +
      `Session: ${params.sessionId}\n` +
      `Request: ${params.request}`;

    await this.sendSlack({ title, text });
  }

  static async notifyError(params: { customerId?: string; context: string; error: string }) {
    const title = '⚠️ Claude error';
    const text =
      `Context: ${params.context}\n` +
      (params.customerId ? `Customer: ${params.customerId}\n` : '') +
      `Error: ${params.error}`;

    await this.sendSlack({ title, text });
  }

  static async notifyPublish(params: {
    customerName?: string;
    customerId: string;
    commitHash?: string;
    message: string;
  }) {
    const title = '✅ Publish completed';
    const text =
      `Customer: ${params.customerName || params.customerId}\n` +
      (params.commitHash ? `Commit: ${params.commitHash}\n` : '') +
      `Message: ${params.message}`;

    await this.sendSlack({ title, text });
  }
}





