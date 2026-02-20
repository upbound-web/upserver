import { query } from "@anthropic-ai/claude-agent-sdk";
import { join, resolve, relative } from "path";
import { access } from "fs/promises";
import { NotificationService } from "./NotificationService.js";

interface Message {
  role: string;
  content: string;
}

export type ClaudeStreamEvent =
  | { type: "init"; sessionId?: string }
  | { type: "text"; text: string }
  | { type: "fileEdit"; path: string }
  | {
      type: "result";
      subtype: string;
      total_cost_usd?: number;
      duration_ms?: number;
    }
  | { type: "error"; message: string };

export class ClaudeAgentService {
  /**
   * Streaming interface around the Claude Agent SDK.
   * Yields incremental events that callers can forward over SSE/WebSockets.
   */
  static async *streamRequest(
    customerId: string,
    customerSiteFolder: string,
    userMessage: string,
    conversationHistory: Message[],
    claudeSessionId?: string,
    imagePaths?: string[]
  ): AsyncGenerator<ClaudeStreamEvent> {
    const sitePath = join(
      process.env.SITES_DIR || "/home/jakedawson/upserver/sites",
      customerSiteFolder
    );

    // Verify the directory exists
    try {
      await access(sitePath);
    } catch {
      yield {
        type: "error",
        message: `Error: Could not access website directory at ${sitePath}`,
      };
      return;
    }

    // Check for API key (optional - SDK can use subscription if available)
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(
        "ANTHROPIC_API_KEY is not set - will attempt to use Claude subscription authentication"
      );
    } else {
      console.log("ANTHROPIC_API_KEY is set - will use API key authentication");
    }

    // Build system prompt (only for new sessions)
    const systemPrompt = `You are helping a small business owner update their website through an AI assistant called UpServer.

CUSTOMER'S SITE: ${customerSiteFolder}
SITE PATH: ${sitePath}

YOUR ROLE:
- Help the customer make changes to their website
- Use the Read, Edit, and Glob tools to actually modify their files
- Be helpful, clear, and explain what changes you're making
- Focus on simple, safe content updates (text, images, styling)

UPSERVER PLATFORM GUIDANCE:
- You are embedded inside the UpServer platform. The customer is already logged in.
- The "Start Server" and "Staging Site" buttons are in the header bar at the top of the page, always visible.
- To preview their site: they should click the "Start Server" button in the top header bar, then once the server is running, click the "Staging Site" button next to it to open the preview. Do NOT tell them to run terminal commands like "npm run dev" — they use the buttons in the header instead.
- To publish changes to their live site: they should go to their Dashboard page and click the "Publish to Live Site" button.
- After you make changes to their site files, remind them to check the staging site preview to see the updates.
- Do NOT reference generic developer workflows (npm commands, localhost URLs, etc.). Always refer to the UpServer buttons and features instead.

SAFETY GUIDELINES:
- If the request requires new functionality, database changes, or complex coding, respond: "This is a bigger change that needs developer involvement. I've flagged this for review and they'll be in touch."
- If you're uncertain about the request, say so and flag for review
- Never delete important files or make destructive changes without explicit confirmation`;

    // Build user message with image information if provided
    let enhancedUserMessage = userMessage;
    if (imagePaths && imagePaths.length > 0) {
      const imageList = imagePaths.map((path) => `- ${path}`).join("\n");
      enhancedUserMessage = `${userMessage}\n\nThe customer has uploaded the following images:\n${imageList}\n\nUse these images to replace/update images as requested. The images are located in the site folder at the paths shown above.`;
    }

    // For new sessions, include full prompt with system instructions
    // For resumed sessions, SDK handles conversation history automatically
    const prompt = claudeSessionId
      ? enhancedUserMessage
      : `${systemPrompt}\n\nCUSTOMER REQUEST: ${enhancedUserMessage}\n\nPlease process this request and make the necessary changes to their website files.`;

    // Build options object with conditional resume
    const queryOptions: any = {
      // Only allow safe file operations
      allowedTools: ["Read", "Edit", "Glob", "Grep"],

      // Auto-approve edits (we'll add manual review later if needed)
      permissionMode: "acceptEdits",

      // Set working directory to customer's site
      cwd: sitePath,

      //model
      model: "claude-haiku-4-5-20251001",

      // Capture stderr for debugging (only log errors, not verbose startup messages)
      stderr: (data: string) => {
        // Only log if it looks like an actual error, not verbose startup messages
        if (
          data.toLowerCase().includes("error") ||
          data.toLowerCase().includes("failed") ||
          data.toLowerCase().includes("exception")
        ) {
          console.error(`[Claude Code stderr] ${data}`);
        }
      },

      // Resume session if claudeSessionId is provided
      ...(claudeSessionId ? { resume: claudeSessionId } : {}),

      // Add security validation
      canUseTool: async (
        tool: string,
        input: Record<string, unknown>,
        options: {
          signal: AbortSignal;
          toolUseID: string;
          [key: string]: unknown;
        }
      ) => {
        // Validate file paths stay within the customer directory
        const targetPath = (input.file_path || input.path) as
          | string
          | undefined;

        if (targetPath && typeof targetPath === "string") {
          const absolutePath = resolve(sitePath, targetPath);
          const relativePath = relative(sitePath, absolutePath);

          // Prevent directory traversal
          if (relativePath.startsWith("..")) {
            return {
              behavior: "deny" as const,
              message: `Security: Cannot access files outside ${sitePath}`,
            };
          }
        }

        // Block dangerous operations
        if (tool === "Bash") {
          return {
            behavior: "deny" as const,
            message: "Bash commands are not allowed for security",
          };
        }

        return {
          behavior: "allow" as const,
          updatedInput: input,
        };
      },
    };

    try {
      // Run the agent with file operation capabilities
      for await (const message of query({
        prompt,
        options: queryOptions,
      })) {
        // Capture session ID from system init message
        if (
          message.type === "system" &&
          message.subtype === "init" &&
          message.session_id
        ) {
          yield { type: "init", sessionId: message.session_id };
          console.log(
            `[${customerId}] Claude session started/resumed: ${message.session_id}`
          );
        }

        // Process different message types
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            // Stream text responses
            if ("text" in block) {
              yield { type: "text", text: block.text };
            }

            // Track file edits
            if ("name" in block && block.name === "Edit") {
              const toolInput = (block as any).input;
              if (toolInput?.file_path) {
                yield { type: "fileEdit", path: toolInput.file_path };
              }
            }
          }
        } else if (message.type === "result") {
          // Log completion
          console.log(
            `[${customerId}] Agent completed: ${message.subtype} ` +
              `(Cost: $${message.total_cost_usd || 0}, Duration: ${
                message.duration_ms || 0
              }ms)`
          );

          yield {
            type: "result",
            subtype: message.subtype,
            total_cost_usd: message.total_cost_usd,
            duration_ms: message.duration_ms,
          };
        }
      }
    } catch (error) {
      console.error("Claude Agent streaming error:", error);
      NotificationService.notifyError({
        customerId,
        context: "ClaudeAgentService.streamRequest",
        error: error instanceof Error ? error.message : String(error),
      }).catch((err) => console.error("Notification error:", err));

      let errorMessage =
        "I'm having trouble processing your request right now.";

      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
        });

        if (error.message.includes("exited with code 1")) {
          errorMessage +=
            " The Claude Code process encountered an error. Check the server logs for details.";
        } else if (
          error.message.includes("authentication") ||
          error.message.includes("auth")
        ) {
          errorMessage +=
            " Authentication failed. Please ensure you're logged into Claude Code (for subscription) or have ANTHROPIC_API_KEY set (for API key).";
        } else if (error.message.includes("ANTHROPIC_API_KEY")) {
          errorMessage += " The Anthropic API key configuration has an issue.";
        } else if (error.message.includes("executable not found")) {
          errorMessage += " Claude Code executable was not found.";
        }
      }

      yield {
        type: "error",
        message:
          errorMessage +
          " Please try again or contact support if the issue persists.",
      };
    }
  }

  /**
   * Existing non-streaming helper that buffers all streamed text
   * into a single response string for legacy callers.
   */
  static async processRequest(
    customerId: string,
    customerSiteFolder: string,
    userMessage: string,
    conversationHistory: Message[],
    claudeSessionId?: string,
    imagePaths?: string[]
  ): Promise<{
    response: string;
    filesModified?: string[];
    claudeSessionId?: string;
    agentCompletedSuccessfully: boolean;
    agentHadError: boolean;
  }> {
    const responseMessages: string[] = [];
    const filesModified: string[] = [];
    let agentCompletedSuccessfully = false;
    let agentHadError = false;
    let capturedSessionId: string | undefined = claudeSessionId;

    try {
      for await (const event of ClaudeAgentService.streamRequest(
        customerId,
        customerSiteFolder,
        userMessage,
        conversationHistory,
        claudeSessionId,
        imagePaths
      )) {
        if (event.type === "init" && event.sessionId) {
          capturedSessionId = event.sessionId;
        } else if (event.type === "text") {
          responseMessages.push(event.text);
        } else if (event.type === "fileEdit") {
          filesModified.push(event.path);
        } else if (event.type === "result") {
          if (event.subtype === "success") {
            agentCompletedSuccessfully = true;
          } else {
            responseMessages.push(
              "\n\nNote: The task encountered some issues and may need review."
            );
          }
        } else if (event.type === "error") {
          agentHadError = true;
          responseMessages.push(event.message);
        }
      }

      if (agentCompletedSuccessfully && responseMessages.length > 0) {
        return {
          response: responseMessages.join("\n\n"),
          filesModified: filesModified.length > 0 ? filesModified : undefined,
          claudeSessionId: capturedSessionId,
          agentCompletedSuccessfully,
          agentHadError,
        };
      }

      return {
        response:
          responseMessages.join("\n\n") ||
          "Request processed, but no response was generated.",
        filesModified: filesModified.length > 0 ? filesModified : undefined,
        claudeSessionId: capturedSessionId,
        agentCompletedSuccessfully,
        agentHadError,
      };
    } catch (error) {
      console.error("Claude Agent error:", error);
      NotificationService.notifyError({
        customerId,
        context: "ClaudeAgentService.processRequest",
        error: error instanceof Error ? error.message : String(error),
      }).catch((err) => console.error("Notification error:", err));

      let errorMessage =
        "I'm having trouble processing your request right now.";

      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
        });

        if (error.message.includes("authentication")) {
          errorMessage +=
            " Authentication failed. Please ensure you're logged into Claude Code (for subscription) or have ANTHROPIC_API_KEY set (for API key).";
        } else if (error.message.includes("ANTHROPIC_API_KEY")) {
          errorMessage += " The Anthropic API key configuration has an issue.";
        } else if (error.message.includes("executable not found")) {
          errorMessage += " Claude Code executable was not found.";
        }
      }

      return {
        response:
          errorMessage +
          " Please try again or contact support if the issue persists.",
        claudeSessionId: capturedSessionId,
        agentCompletedSuccessfully: false,
        agentHadError: true,
      };
    }
  }
}
