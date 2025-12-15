import { db } from '../config/db.js';
import { devServers, customers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import treeKill from 'tree-kill';
import findFreePort from 'find-free-port';

// Store running processes in memory
const runningProcesses = new Map<string, ChildProcess>();

export class DevServerService {
  static async start(customerId: string) {
    // Get customer details
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData.length) {
      throw new Error('Customer not found');
    }

    const customer = customerData[0];
    const sitePath = join(process.env.SITES_DIR || '/home/jakedawson/upserver/sites', customer.siteFolder);

    if (!existsSync(sitePath)) {
      throw new Error(`Site folder not found: ${sitePath}`);
    }

    // Check if already running
    const existing = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (existing.length && existing[0].status === 'running') {
      return {
        port: existing[0].port!,
        url: `http://localhost:${existing[0].port}`,
        status: 'already_running',
      };
    }

    // Detect project type
    const hasPackageJson = existsSync(join(sitePath, 'package.json'));
    const isNodeProject = hasPackageJson;

    // Determine main server port (prefer fixed stagingPort from DB, otherwise find a free one)
    const startPort = parseInt(process.env.DEV_SERVER_START_PORT || '3000');
    const desiredPort = customer.stagingPort;
    let port: number;

    if (desiredPort) {
      const [foundPort] = await findFreePort(desiredPort, desiredPort + 1);
      if (!foundPort || foundPort !== desiredPort) {
        throw new Error(`Configured port ${desiredPort} is already in use`);
      }
      port = desiredPort;
    } else {
      const [foundPort] = await findFreePort(startPort, startPort + 100);
      if (!foundPort) {
        throw new Error('No free ports available');
      }
      port = foundPort;
    }

    // Port for TanStack devtools event bus (defaults to 42069)
    // Best-effort only – if we can't find a free port, fall back to the default
    const devtoolsStartPort = parseInt(process.env.TANSTACK_DEVTOOLS_PORT || '42069');
    let devtoolsPort = devtoolsStartPort;
    try {
      const [foundDevtoolsPort] = await findFreePort(devtoolsStartPort, devtoolsStartPort + 50);
      if (foundDevtoolsPort) {
        devtoolsPort = foundDevtoolsPort;
      }
    } catch (error) {
      console.warn(
        `[${customer.siteFolder}] Unable to find free port for TanStack devtools, using default ${devtoolsStartPort}:`,
        error
      );
    }

    // Start appropriate server
    let childProcess: ChildProcess;
    let command: string;
    let args: string[];

    if (isNodeProject) {
      // Check for package manager first
      const hasPnpmLock = existsSync(join(sitePath, 'pnpm-lock.yaml'));
      const hasYarnLock = existsSync(join(sitePath, 'yarn.lock'));

      // Read package.json to check for vite and handle port override
      const packageJsonPath = join(sitePath, 'package.json');
      let useViteDirectly = false;
      
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          const devScriptContent = packageJson.scripts?.dev || '';
          
          // If it's a vite project with --port flag, we need to override it
          if (devScriptContent.includes('vite') && devScriptContent.includes('--port')) {
            useViteDirectly = true;
            // Extract vite command, replacing --port with our port
            const viteArgs = devScriptContent
              .replace(/vite\s+/, '')
              .replace(/--port\s+\d+/, `--port ${port}`)
              .split(/\s+/)
              .filter(Boolean);
            
            // Use the appropriate package manager to run vite
            if (hasPnpmLock) {
              // Use npx to ensure pnpm is available even if not in PATH
              command = 'npx';
              args = ['-y', 'pnpm', 'exec', 'vite', ...viteArgs];
            } else if (hasYarnLock) {
              command = 'yarn';
              args = ['vite', ...viteArgs];
            } else {
              command = 'npx';
              args = ['vite', ...viteArgs];
            }
          }
        } catch (error) {
          console.warn(`[${customer.siteFolder}] Failed to parse package.json:`, error);
        }
      }

      if (!useViteDirectly) {
        // Use standard dev script
        if (hasPnpmLock) {
          // Use npx to ensure pnpm is available even if not in PATH
          command = 'npx';
          args = ['-y', 'pnpm', 'dev'];
        } else if (hasYarnLock) {
          command = 'yarn';
          args = ['dev'];
        } else {
          command = 'npm';
          args = ['run', 'dev'];
        }
      }

      childProcess = spawn(command, args, {
        cwd: sitePath,
        stdio: 'pipe',
        env: {
          ...process.env,
          PORT: port.toString(),
          TANSTACK_DEVTOOLS_PORT: devtoolsPort.toString(),
        },
      });
    } else {
      // Static HTML site
      command = 'python3';
      args = ['-m', 'http.server', port.toString()];

      childProcess = spawn(command, args, {
        cwd: sitePath,
        stdio: 'pipe',
      });
    }

    // Capture stdout and stderr for debugging
    let stdoutBuffer = '';
    let stderrBuffer = '';

    childProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      console.log(`[${customer.siteFolder}] stdout:`, output.trim());
    });

    childProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;
      console.error(`[${customer.siteFolder}] stderr:`, output.trim());
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      console.error(`[${customer.siteFolder}] Process error:`, error);
      runningProcesses.delete(customerId);
      
      db.update(devServers)
        .set({ status: 'error', pid: null })
        .where(eq(devServers.customerId, customerId))
        .then(() => {})
        .catch(console.error);
    });

    // Store process
    runningProcesses.set(customerId, childProcess);

    // Store state in database
    await db
      .insert(devServers)
      .values({
        customerId,
        port,
        pid: childProcess.pid!,
        status: 'running',
        startedAt: new Date(),
        lastActivity: new Date(),
      })
      .onConflictDoUpdate({
        target: devServers.customerId,
        set: {
          port,
          pid: childProcess.pid!,
          status: 'running',
          startedAt: new Date(),
          lastActivity: new Date(),
        },
      });

    console.log(`Started dev server for ${customer.siteFolder} on port ${port}`);

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      console.log(`Dev server for ${customer.siteFolder} exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
      
      if (code !== 0 && code !== null) {
        console.error(`[${customer.siteFolder}] Exit code ${code} - Last stderr output:`, stderrBuffer.slice(-500));
      }
      
      runningProcesses.delete(customerId);

      db.update(devServers)
        .set({ status: 'stopped', pid: null })
        .where(eq(devServers.customerId, customerId))
        .then(() => {})
        .catch(console.error);
    });

    return {
      port,
      url: `http://localhost:${port}`,
      status: 'started',
    };
  }

  static async stop(customerId: string) {
    const serverData = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (!serverData.length) {
      return { status: 'not_found' };
    }

    const server = serverData[0];

    // Kill process if running
    if (server.pid && server.status === 'running') {
      const childProcess = runningProcesses.get(customerId);

      if (childProcess) {
        // Kill process tree
        return new Promise<{ status: string }>((resolve) => {
          treeKill(server.pid!, 'SIGTERM', (err) => {
            if (err) {
              console.error('Error killing process:', err);
            }

            runningProcesses.delete(customerId);

            db.update(devServers)
              .set({ status: 'stopped', pid: null })
              .where(eq(devServers.customerId, customerId))
              .then(() => {})
              .catch(console.error);

            resolve({ status: 'stopped' });
          });
        });
      }
    }

    // Update status
    await db
      .update(devServers)
      .set({ status: 'stopped', pid: null })
      .where(eq(devServers.customerId, customerId));

    return { status: 'stopped' };
  }

  static async getStatus(customerId: string) {
    const serverData = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (!serverData.length) {
      return null;
    }

    return serverData[0];
  }

  static async updateActivity(customerId: string) {
    await db
      .update(devServers)
      .set({ lastActivity: new Date() })
      .where(eq(devServers.customerId, customerId));
  }

  static async cleanupInactive() {
    const timeoutMinutes = parseInt(process.env.DEV_SERVER_TIMEOUT_MINUTES || '30');
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    // Find inactive servers
    const inactiveServers = await db
      .select()
      .from(devServers)
      .where(eq(devServers.status, 'running'));

    for (const server of inactiveServers) {
      if (server.lastActivity && server.lastActivity < cutoffTime) {
        console.log(`Stopping inactive dev server for customer ${server.customerId}`);
        await this.stop(server.customerId);
      }
    }
  }
}
