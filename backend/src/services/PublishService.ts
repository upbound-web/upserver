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

  static async getPublishHistory(customerSiteFolder: string, limit = 10) {
    const sitePath = join(
      process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
      customerSiteFolder
    );

    try {
      const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
      const { stdout } = await execAsync(
        `git log -n ${safeLimit} --format="%H|%at|%s"`,
        { cwd: sitePath }
      );

      if (!stdout.trim()) {
        return [];
      }

      return stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [hash, timestamp, subject] = line.split('|');
          return {
            commitHash: hash,
            timestamp: parseInt(timestamp, 10) * 1000,
            message: subject,
          };
        });
    } catch (error) {
      console.error('Error getting publish history:', error);
      return [];
    }
  }

  static async rollbackToCommit(customerSiteFolder: string, targetCommitHash: string) {
    const sitePath = join(
      process.env.SITES_DIR || '/home/jakedawson/upserver/sites',
      customerSiteFolder
    );

    try {
      if (!targetCommitHash || !/^[a-f0-9]{7,40}$/i.test(targetCommitHash)) {
        return { success: false, message: 'Invalid commit hash' };
      }

      const { stdout: dirtyOutput } = await execAsync('git status --porcelain', {
        cwd: sitePath,
      });
      if (dirtyOutput.trim()) {
        return {
          success: false,
          message:
            'Rollback is blocked because there are unpublished local changes. Publish or clear local changes first.',
        };
      }

      await execAsync(`git rev-parse --verify ${targetCommitHash}^{commit}`, {
        cwd: sitePath,
      });

      const { stdout: currentHashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: sitePath,
      });
      const currentHash = currentHashOutput.trim();

      if (currentHash === targetCommitHash) {
        return {
          success: false,
          message: 'This version is already current. Nothing to roll back.',
        };
      }

      await execAsync(`git restore --source ${targetCommitHash} --staged --worktree .`, {
        cwd: sitePath,
      });

      const { stdout: stagedStatusOutput } = await execAsync('git status --porcelain', {
        cwd: sitePath,
      });
      if (!stagedStatusOutput.trim()) {
        return {
          success: false,
          message: 'Rollback produced no file changes.',
        };
      }

      const timestamp = new Date().toISOString();
      const rollbackMessage = `Rollback via UpServer [${timestamp}] to ${targetCommitHash.slice(0, 7)}`;
      await execAsync(`git commit -m "${rollbackMessage}"`, { cwd: sitePath });

      const { stdout: newHashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: sitePath,
      });
      const newCommitHash = newHashOutput.trim();

      await execAsync('git push', { cwd: sitePath });

      await NotificationService.notifyPublish({
        customerId: customerSiteFolder,
        message: `Rollback completed to ${targetCommitHash.slice(0, 7)}`,
        commitHash: newCommitHash,
      }).catch((err) => console.error('Notification error:', err));

      return {
        success: true,
        commitHash: newCommitHash,
        rolledBackTo: targetCommitHash,
        message: `Rolled back successfully to ${targetCommitHash.slice(0, 7)}.`,
      };
    } catch (error: any) {
      console.error('Rollback error:', error);
      return {
        success: false,
        message: `Failed to roll back changes: ${error.message}`,
        error: error.message,
      };
    }
  }
}
