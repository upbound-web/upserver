import { db } from "../config/db.js";
import { devServers, customers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import treeKill from "tree-kill";
import findFreePort from "find-free-port";

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

    if (existing.length && existing[0].status === "running") {
      return {
        port: existing[0].port!,
        url: `http://localhost:${existing[0].port}`,
        status: "already_running",
      };
    }

    // Detect project type
    const hasPackageJson = existsSync(join(sitePath, "package.json"));
    const isNodeProject = hasPackageJson;

    // Determine main server port (prefer fixed stagingPort from DB, otherwise find a free one)
    const startPort = parseInt(process.env.DEV_SERVER_START_PORT || "3000");
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
        throw new Error("No free ports available");
      }
      port = foundPort;
    }

    // Port for TanStack devtools event bus (defaults to 42069)
    // Best-effort only – if we can't find a free port, fall back to the default
    const devtoolsStartPort = parseInt(
      process.env.TANSTACK_DEVTOOLS_PORT || "42069"
    );
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
          args = ["-y", "pnpm", "exec", "vite", "dev", "--port", port.toString()];
        } else {
          command = "npx";
          args = ["-y", "pnpm", "run", "dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString());
          }
        }
      } else if (hasYarnLock) {
        installCommand = "yarn";
        installArgs = ["install"];

        if (supportsPortFlag && devScriptHasHardcodedPort) {
          command = "yarn";
          args = ["vite", "dev", "--port", port.toString()];
        } else {
          command = "yarn";
          args = ["dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString());
          }
        }
      } else {
        installCommand = "npm";
        installArgs = ["install"];

        if (supportsPortFlag && devScriptHasHardcodedPort) {
          command = "npx";
          args = ["vite", "dev", "--port", port.toString()];
        } else {
          command = "npm";
          args = ["run", "dev"];
          if (supportsPortFlag) {
            args.push("--", "--port", port.toString());
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
      args = ["-m", "http.server", port.toString()];

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

      db.update(devServers)
        .set({ status: "error", pid: null })
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
        status: "running",
        startedAt: new Date(),
        lastActivity: new Date(),
      })
      .onConflictDoUpdate({
        target: devServers.customerId,
        set: {
          port,
          pid: childProcess.pid!,
          status: "running",
          startedAt: new Date(),
          lastActivity: new Date(),
        },
      });

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

      db.update(devServers)
        .set({ status: "stopped", pid: null })
        .where(eq(devServers.customerId, customerId))
        .then(() => {})
        .catch(console.error);
    });

    return {
      port,
      url: `http://localhost:${port}`,
      status: "started",
    };
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
}
