import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { NotificationService } from './NotificationService.js';

const execAsync = promisify(exec);

export class PublishService {
  static async publish(customerSiteFolder: string) {
    const sitePath = join(
      process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
      customerSiteFolder
    );

    try {
      // Check for uncommitted changes
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: sitePath,
      });

      if (!statusOutput.trim()) {
        return {
          success: false,
          message: 'No changes to publish',
        };
      }

      // Stage all changes
      await execAsync('git add .', { cwd: sitePath });

      // Create commit
      const timestamp = new Date().toISOString();
      const commitMessage = `Updates via UpServer [${timestamp}]\n\n🤖 Generated with UpServer\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

      const { stdout: commitOutput } = await execAsync(
        `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        { cwd: sitePath }
      );

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: sitePath,
      });
      const commitHash = hashOutput.trim();

      // Push to origin
      try {
        await execAsync('git push', { cwd: sitePath });
      } catch (pushError: any) {
        // If push fails, still return success with a warning
        NotificationService.notifyPublish({
          customerId: customerSiteFolder,
          message: 'Changes committed locally but push failed',
          commitHash,
        }).catch((err) => console.error('Notification error:', err));
        return {
          success: true,
          commitHash,
          message: `Changes committed locally (${commitHash.substring(0, 7)}) but push failed. You may need to push manually or check your git configuration.`,
          warning: 'push_failed',
        };
      }

      await NotificationService.notifyPublish({
        customerId: customerSiteFolder,
        message: 'Changes published successfully',
        commitHash,
      }).catch((err) => console.error('Notification error:', err));

      return {
        success: true,
        commitHash,
        message: `Changes published successfully! Commit: ${commitHash.substring(0, 7)}`,
      };
    } catch (error: any) {
      console.error('Publish error:', error);

      return {
        success: false,
        message: `Failed to publish changes: ${error.message}`,
        error: error.message,
      };
    }
  }

  static async getLastPublish(customerSiteFolder: string) {
    const sitePath = join(
      process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
      customerSiteFolder
    );

    try {
      const { stdout } = await execAsync(
        'git log -1 --format="%H|%at|%s"',
        { cwd: sitePath }
      );

      if (!stdout.trim()) {
        return null;
      }

      const [hash, timestamp, subject] = stdout.trim().split('|');

      return {
        commitHash: hash,
        timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
        message: subject,
      };
    } catch (error) {
      console.error('Error getting last publish:', error);
      return null;
    }
  }
}
