import { db } from "../config/db.js";
import { devServers, customers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { spawn, ChildProcess, exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import treeKill from "tree-kill";
import findFreePort from "find-free-port";
import { createConnection } from "node:net";
import { promisify } from "util";

const execAsync = promisify(exec);

// Store running processes in memory
const runningProcesses = new Map<string, ChildProcess>();
const startingCustomers = new Set<string>();

export class DevServerService {
  private static getDevServerPortRange() {
    const parsedStart = parseInt(process.env.DEV_SERVER_START_PORT || "3000", 10);
    const start = Number.isFinite(parsedStart) ? parsedStart : 3000;
    const parsedRangeSize = parseInt(process.env.DEV_SERVER_PORT_RANGE_SIZE || "50", 10);
    const rangeSize = Number.isFinite(parsedRangeSize) ? Math.max(0, parsedRangeSize) : 50;
    const parsedEnd = parseInt(
      process.env.DEV_SERVER_END_PORT || `${start + rangeSize}`,
      10
    );
    const end = Number.isFinite(parsedEnd) ? Math.max(start, parsedEnd) : start + rangeSize;
    return { start, end };
  }

  private static isProcessAlive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private static async isPortReachable(
    port: number,
    timeoutMs = 1200
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    });
  }

  private static async waitForPortReachable(
    port: number,
    timeoutMs = 20000,
    intervalMs = 300
  ): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      // Keep each probe short so total wait stays predictable
      const reachable = await this.isPortReachable(port, 400);
      if (reachable) return true;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  static async start(customerId: string) {
    if (startingCustomers.has(customerId)) {
      throw new Error("Dev server start already in progress for this site");
    }
    startingCustomers.add(customerId);

    try {
    // Get customer details
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData.length) {
      throw new Error("Customer not found");
    }

    const customer = customerData[0];
    const sitePath = join(
      process.env.SITES_DIR || "/home/jakedawson/upserver/sites",
      customer.siteFolder
    );

    if (!existsSync(sitePath)) {
      throw new Error(`Site folder not found: ${sitePath}`);
    }

    // Check if already running
    const existing = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (existing.length && existing[0].status === "starting") {
      return {
        port: existing[0].port!,
        url: `http://localhost:${existing[0].port}`,
        status: "starting",
      };
    }

    if (existing.length && existing[0].status === "running") {
      const existingPid = existing[0].pid;
      const existingPort = existing[0].port;
      const alive = existingPid ? this.isProcessAlive(existingPid) : false;
      const reachable = await this.isPortReachable(existingPort);

      if (!alive || !reachable) {
        console.warn(
          `[${customer.siteFolder}] Stale running state detected (pid=${existingPid}, port=${existingPort}, alive=${alive}, reachable=${reachable}). Resetting state.`
        );
        await db
          .update(devServers)
          .set({ status: "stopped", pid: null })
          .where(eq(devServers.customerId, customerId));
      } else {
        return {
          port: existing[0].port!,
          url: `http://localhost:${existing[0].port}`,
          status: "already_running",
        };
      }
    }

    // Re-check after stale status reset above
    const existingAfterReset = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (existingAfterReset.length && existingAfterReset[0].status === "running") {
      return {
        port: existingAfterReset[0].port!,
        url: `http://localhost:${existingAfterReset[0].port}`,
        status: "already_running",
      };
    }

    // Detect project type
    const hasPackageJson = existsSync(join(sitePath, "package.json"));
    const isNodeProject = hasPackageJson;

    // Determine main server port (prefer fixed stagingPort from DB, otherwise find a free one)
    const { start: startPort, end: endPort } = this.getDevServerPortRange();
    const desiredPort = customer.stagingPort;
    let port: number;

    if (desiredPort) {
      if (desiredPort < startPort || desiredPort > endPort) {
        throw new Error(
          `Configured port ${desiredPort} is outside the allowed tunnel range ${startPort}-${endPort}.`
        );
      }
      const desiredReachable = await this.isPortReachable(desiredPort);
      if (desiredReachable) {
        throw new Error(
          `Configured port ${desiredPort} is already in use. This site uses a fixed staging port for tunnel routing, so the port must be free before start.`
        );
      }
      port = desiredPort;
    } else {
      const [foundPort] = await findFreePort(startPort, endPort + 1);
      if (!foundPort) {
        throw new Error("No free ports available");
      }
      port = foundPort;
    }

    await db
      .insert(devServers)
      .values({
        customerId,
        port,
        pid: null,
        status: "starting",
        startedAt: new Date(),
        lastActivity: new Date(),
      })
      .onConflictDoUpdate({
        target: devServers.customerId,
        set: {
          port,
          pid: null,
          status: "starting",
          startedAt: new Date(),
          lastActivity: new Date(),
        },
      });

    // Port for TanStack devtools event bus (defaults to 42069)
    // Best-effort only – if we can't find a free port, fall back to the default
    const parsedDevtoolsStartPort = parseInt(
      process.env.TANSTACK_DEVTOOLS_PORT || "42069",
      10
    );
    const devtoolsStartPort = Number.isFinite(parsedDevtoolsStartPort)
      ? parsedDevtoolsStartPort
      : 42069;
    let devtoolsPort = devtoolsStartPort;
    try {
      const [foundDevtoolsPort] = await findFreePort(
        devtoolsStartPort,
        devtoolsStartPort + 50
      );
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
    let command: string = "";
    let args: string[] = [];

    if (isNodeProject) {
      // Check for package manager first
      const hasPnpmLock = existsSync(join(sitePath, "pnpm-lock.yaml"));
      const hasYarnLock = existsSync(join(sitePath, "yarn.lock"));

      // Read package.json to detect how to pass port overrides
      const packageJsonPath = join(sitePath, "package.json");
      let devScriptContent = "";
      let hasTanstackDevtoolsVite = false;
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
          devScriptContent = packageJson.scripts?.dev || "";
          const deps = packageJson.dependencies || {};
          const devDeps = packageJson.devDependencies || {};
          hasTanstackDevtoolsVite = Boolean(
            deps["@tanstack/devtools-vite"] || devDeps["@tanstack/devtools-vite"]
          );
        } catch (error) {
          console.warn(
            `[${customer.siteFolder}] Failed to parse package.json:`,
            error
          );
        }
      }

      // Determine whether the dev script likely supports a `--port` flag.
      // (Vite does; TanStack Start commonly uses Vite/Vinxi under the hood.)
      const supportsPortFlag = /\b(vite|vinxi)\b/.test(devScriptContent);

      // If dependencies aren't installed, an npm script can accidentally fall back
      // to a system `vite` binary (e.g. /usr/bin/vite) and crash with confusing errors.
      // Ensure `node_modules` exists before trying to start the dev server.
      const nodeModulesPath = join(sitePath, "node_modules");

      let installCommand = "";
      let installArgs: string[] = [];

      // If the dev script hardcodes --port (common in templates), forwarding an additional
      // `--port` often won't override it. In that case, bypass the script and run Vite directly.
      const devScriptHasHardcodedPort = /\s--port\s+\d+/.test(devScriptContent);

      if (hasPnpmLock) {
        // Use npx to ensure pnpm is available even if not in PATH
        installCommand = "npx";
        installArgs = ["-y", "pnpm", "install"];

        if (supportsPortFlag && devScriptHasHardcodedPort) {
          command = "npx";
          args = ["-y", "pnpm", "exec", "vite", "dev", "--port", port.toString(), "--host", "0.0.0.0"];
        } else {
          command = "npx";
          args = ["-y", "pnpm", "run", "dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString(), "--host", "0.0.0.0");
          }
        }
      } else if (hasYarnLock) {
        installCommand = "yarn";
        installArgs = ["install"];

        if (supportsPortFlag && devScriptHasHardcodedPort) {
          command = "yarn";
          args = ["vite", "dev", "--port", port.toString(), "--host", "0.0.0.0"];
        } else {
          command = "yarn";
          args = ["dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString(), "--host", "0.0.0.0");
          }
        }
      } else {
        installCommand = "npm";
        installArgs = ["install"];

        if (supportsPortFlag && devScriptHasHardcodedPort) {
          command = "npx";
          args = ["vite", "dev", "--port", port.toString(), "--host", "0.0.0.0"];
        } else {
          command = "npm";
          args = ["run", "dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString(), "--host", "0.0.0.0");
          }
        }
      }

      if (!existsSync(nodeModulesPath)) {
        console.log(
          `[${customer.siteFolder}] node_modules missing; installing dependencies...`
        );

        await new Promise<void>((resolve, reject) => {
          const installProcess = spawn(installCommand, installArgs, {
            cwd: sitePath,
            stdio: "pipe",
            env: {
              ...process.env,
              TANSTACK_DEVTOOLS_PORT: devtoolsPort.toString(),
            },
          });

          let installStdout = "";
          let installStderr = "";

          installProcess.stdout?.on("data", (data) => {
            const out = data.toString();
            installStdout += out;
            console.log(`[${customer.siteFolder}] install stdout:`, out.trim());
          });

          installProcess.stderr?.on("data", (data) => {
            const out = data.toString();
            installStderr += out;
            console.error(`[${customer.siteFolder}] install stderr:`, out.trim());
          });

          installProcess.on("error", (error) => {
            reject(error);
          });

          installProcess.on("exit", (code, signal) => {
            if (code === 0) {
              resolve();
              return;
            }

            const tail = (installStderr || installStdout).slice(-2000);
            reject(
              new Error(
                `Dependency install failed for ${customer.siteFolder} (code ${code}${
                  signal ? `, signal ${signal}` : ""
                }).\n${tail}`
              )
            );
          });
        });
      }

      // TanStack devtools' Vite plugin starts a separate event-bus on port 42069 by default.
      // That collides when multiple sites run. Disable it for UpServer-spawned instances by
      // forcing NODE_ENV away from "development" (the event-bus won't start otherwise).
      const nodeEnvForChild =
        hasTanstackDevtoolsVite ? "production" : process.env.NODE_ENV;

      childProcess = spawn(command, args, {
        cwd: sitePath,
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_ENV: nodeEnvForChild,
          PORT: port.toString(),
          TANSTACK_DEVTOOLS_PORT: devtoolsPort.toString(),
        },
      });
    } else {
      // Static HTML site
      command = "python3";
      args = ["-m", "http.server", port.toString(), "--bind", "0.0.0.0"];

      childProcess = spawn(command, args, {
        cwd: sitePath,
        stdio: "pipe",
      });
    }

    // Capture stdout and stderr for debugging
    let stdoutBuffer = "";
    let stderrBuffer = "";

    childProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      console.log(`[${customer.siteFolder}] stdout:`, output.trim());
    });

    childProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      stderrBuffer += output;
      console.error(`[${customer.siteFolder}] stderr:`, output.trim());
    });

    // Handle process errors
    childProcess.on("error", (error) => {
      console.error(`[${customer.siteFolder}] Process error:`, error);
      runningProcesses.delete(customerId);

      db.select()
        .from(devServers)
        .where(eq(devServers.customerId, customerId))
        .limit(1)
        .then((rows) => {
          if (rows.length && rows[0].pid === childProcess.pid) {
            db.update(devServers)
              .set({ status: "error", pid: null })
              .where(eq(devServers.customerId, customerId))
              .then(() => {})
              .catch(console.error);
          }
        })
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
        status: "starting",
        startedAt: new Date(),
        lastActivity: new Date(),
      })
      .onConflictDoUpdate({
        target: devServers.customerId,
        set: {
          port,
          pid: childProcess.pid!,
          status: "starting",
          startedAt: new Date(),
          lastActivity: new Date(),
        },
      });

    const ready = await this.waitForPortReachable(port);
    if (!ready) {
      const tail = stderrBuffer.slice(-500).trim();
      throw new Error(
        `Dev server failed to become ready on port ${port}.${tail ? ` Last error: ${tail}` : ""}`
      );
    }

    await db
      .update(devServers)
      .set({
        status: "running",
        pid: childProcess.pid!,
        lastActivity: new Date(),
      })
      .where(eq(devServers.customerId, customerId));

    console.log(
      `Started dev server for ${customer.siteFolder} on port ${port}`
    );

    // Handle process exit
    childProcess.on("exit", (code, signal) => {
      console.log(
        `Dev server for ${customer.siteFolder} exited with code ${code}${
          signal ? ` and signal ${signal}` : ""
        }`
      );

      if (code !== 0 && code !== null) {
        console.error(
          `[${customer.siteFolder}] Exit code ${code} - Last stderr output:`,
          stderrBuffer.slice(-500)
        );
      }

      runningProcesses.delete(customerId);

      db.select()
        .from(devServers)
        .where(eq(devServers.customerId, customerId))
        .limit(1)
        .then((rows) => {
          if (rows.length && rows[0].pid === childProcess.pid) {
            db.update(devServers)
              .set({ status: "stopped", pid: null })
              .where(eq(devServers.customerId, customerId))
              .then(() => {})
              .catch(console.error);
          }
        })
        .catch(console.error);
    });

    return {
      port,
      url: `http://localhost:${port}`,
      status: "started",
    };
    } finally {
      startingCustomers.delete(customerId);
    }
  }

  static async stop(customerId: string) {
    const serverData = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (!serverData.length) {
      return { status: "not_found" };
    }

    const server = serverData[0];

    // Kill process if running
    if (server.pid && server.status === "running") {
      const childProcess = runningProcesses.get(customerId);

      if (childProcess) {
        // Kill process tree
        return new Promise<{ status: string }>((resolve) => {
          treeKill(server.pid!, "SIGTERM", (err) => {
            if (err) {
              console.error("Error killing process:", err);
            }

            runningProcesses.delete(customerId);

            db.update(devServers)
              .set({ status: "stopped", pid: null })
              .where(eq(devServers.customerId, customerId))
              .then(() => {})
              .catch(console.error);

            resolve({ status: "stopped" });
          });
        });
      }
    }

    // Update status
    await db
      .update(devServers)
      .set({ status: "stopped", pid: null })
      .where(eq(devServers.customerId, customerId));

    return { status: "stopped" };
  }

  static async getStatus(customerId: string) {
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    const desiredPort = customerData.length ? customerData[0].stagingPort : null;

    const serverData = await db
      .select()
      .from(devServers)
      .where(eq(devServers.customerId, customerId))
      .limit(1);

    if (!serverData.length) {
      return null;
    }

    if (serverData[0].status === "starting") {
      const alive = serverData[0].pid
        ? this.isProcessAlive(serverData[0].pid)
        : false;
      const reachable = await this.isPortReachable(serverData[0].port);

      if (reachable) {
        await db
          .update(devServers)
          .set({ status: "running", lastActivity: new Date() })
          .where(eq(devServers.customerId, customerId));

        return {
          ...serverData[0],
          status: "running" as const,
          lastActivity: new Date(),
        };
      }

      if (!alive) {
        await db
          .update(devServers)
          .set({ status: "error", pid: null })
          .where(eq(devServers.customerId, customerId));

        return {
          ...serverData[0],
          status: "error" as const,
          pid: null,
        };
      }
    }

    if (serverData[0].status === "running") {
      const alive = serverData[0].pid
        ? this.isProcessAlive(serverData[0].pid)
        : false;
      const reachable = await this.isPortReachable(serverData[0].port);

      if (!alive || !reachable) {
        await db
          .update(devServers)
          .set({ status: "stopped", pid: null })
          .where(eq(devServers.customerId, customerId));

        return {
          ...serverData[0],
          status: "stopped" as const,
          pid: null,
        };
      }
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
    const timeoutMinutes = parseInt(
      process.env.DEV_SERVER_TIMEOUT_MINUTES || "30"
    );
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    // Find inactive servers
    const inactiveServers = await db
      .select()
      .from(devServers)
      .where(eq(devServers.status, "running"));

    for (const server of inactiveServers) {
      if (server.lastActivity && server.lastActivity < cutoffTime) {
        console.log(
          `Stopping inactive dev server for customer ${server.customerId}`
        );
        await this.stop(server.customerId);
      }
    }
  }

  static async getPreflight(customerId: string) {
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerData.length) {
      throw new Error("Customer not found");
    }

    const customer = customerData[0];
    const sitePath = join(
      process.env.SITES_DIR || "/home/jakedawson/upserver/sites",
      customer.siteFolder
    );

    const siteFolderExists = existsSync(sitePath);
    const stagingUrlConfigured = Boolean(customer.stagingUrl);

    let gitRemoteConfigured = false;
    let hasUncommittedChanges = false;
    if (siteFolderExists) {
      try {
        const { stdout: remoteOut } = await execAsync("git remote -v", {
          cwd: sitePath,
        });
        gitRemoteConfigured = remoteOut.trim().length > 0;
      } catch {
        gitRemoteConfigured = false;
      }

      try {
        const { stdout: statusOut } = await execAsync("git status --porcelain", {
          cwd: sitePath,
        });
        hasUncommittedChanges = statusOut.trim().length > 0;
      } catch {
        hasUncommittedChanges = false;
      }
    }

    const status = await this.getStatus(customerId);
    const devServerHealthy = status?.status === "running";

    const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
    let hasClaudeCli = false;
    try {
      await execAsync("which claude");
      hasClaudeCli = true;
    } catch {
      hasClaudeCli = false;
    }
    const claudeReady = hasApiKey || hasClaudeCli;

    return {
      checks: {
        siteFolderExists,
        devServerHealthy,
        stagingUrlConfigured,
        gitRemoteConfigured,
        hasUncommittedChanges,
        claudeReady,
      },
      sitePath,
      status: status || null,
    };
  }
}
