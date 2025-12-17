import { Resend } from 'resend';

export class NotificationService {
  private static resend = new Resend(process.env.RESEND_API_KEY);
  private static developerEmail = process.env.DEVELOPER_EMAIL;
  private static emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  private static async sendEmail(title: string, htmlContent: string) {
    if (!process.env.RESEND_API_KEY || !this.developerEmail) {
      console.log('[Notification] Resend API Key or Developer Email not configured. Logging payload:', { title, htmlContent });
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.emailFrom,
        to: this.developerEmail,
        subject: title,
        html: htmlContent,
      });

      if (error) {
        console.error('[Notification] Failed to send email notification', error);
      }
    } catch (error) {
      console.error('[Notification] Failed to send email notification', error);
    }
  }

  static async notifyFlaggedRequest(params: {
    customerName?: string;
    customerId: string;
    request: string;
    sessionId: string;
  }) {
    const title = '🚩 Request flagged for review';
    const html =
      `<p><strong>Customer:</strong> ${params.customerName || params.customerId}</p>` +
      `<p><strong>Session:</strong> ${params.sessionId}</p>` +
      `<p><strong>Request:</strong> ${params.request}</p>`;

    await this.sendEmail(title, html);
  }

  static async notifyError(params: { customerId?: string; context: string; error: string }) {
    const title = '⚠️ Claude error';
    const html =
      `<p><strong>Context:</strong> ${params.context}</p>` +
      (params.customerId ? `<p><strong>Customer:</strong> ${params.customerId}</p>` : '') +
      `<p><strong>Error:</strong> ${params.error}</p>`;

    await this.sendEmail(title, html);
  }

  static async notifyPublish(params: {
    customerName?: string;
    customerId: string;
    commitHash?: string;
    message: string;
  }) {
    const title = '✅ Publish completed';
    const html =
      `<p><strong>Customer:</strong> ${params.customerName || params.customerId}</p>` +
      (params.commitHash ? `<p><strong>Commit:</strong> ${params.commitHash}</p>` : '') +
      `<p><strong>Message:</strong> ${params.message}</p>`;

    await this.sendEmail(title, html);
  }
}
