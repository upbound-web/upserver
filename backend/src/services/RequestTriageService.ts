export type TriageDecision = "auto" | "flag";
export type TriageScope = "minor" | "major" | "uncertain";

export interface TriageResult {
  decision: TriageDecision;
  scope: TriageScope;
  confidence: number;
  reason: string;
  triggers: string[];
  policyVersion: string;
}

interface EvaluateInput {
  request: string;
  filesModified?: string[];
  agentCompletedSuccessfully: boolean;
  agentHadError: boolean;
}

const MAJOR_REQUEST_PATTERNS: RegExp[] = [
  /\b(booking system|appointment system|reservation system)\b/i,
  /\b(payment|checkout|stripe|subscription|billing)\b/i,
  /\b(login|sign[ -]?in|authentication|auth)\b/i,
  /\b(database|schema|migration|api endpoint|backend)\b/i,
  /\b(redesign|rebuild|complete overhaul|new layout)\b/i,
  /\b(integration|webhook|crm|erp)\b/i,
];

const HIGH_RISK_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)package\.json$/i,
  /(^|\/)(vite|webpack|tsconfig|next|nuxt|astro)\.config/i,
  /(^|\/)(server|backend|api|functions?)\//i,
  /(^|\/)(routes?|router)\//i,
];

export class RequestTriageService {
  static evaluate(input: EvaluateInput): TriageResult {
    const triggers: string[] = [];
    const normalizedRequest = input.request.trim();
    const filesModified = input.filesModified || [];

    if (input.agentHadError) {
      triggers.push("agent_execution_error");
      return {
        decision: "flag",
        scope: "uncertain",
        confidence: 0.97,
        reason:
          "The assistant encountered an error and could not complete the request cleanly, so manual review is required.",
        triggers,
        policyVersion: "v1",
      };
    }

    // If the agent didn't report clean success but still modified files,
    // it likely completed the work — let the other checks below decide.
    // Only flag if it did nothing at all.
    if (!input.agentCompletedSuccessfully && filesModified.length === 0) {
      triggers.push("agent_incomplete_no_edits");
      return {
        decision: "flag",
        scope: "uncertain",
        confidence: 0.9,
        reason:
          "The assistant did not complete successfully and made no file changes, so manual review is required.",
        triggers,
        policyVersion: "v1",
      };
    }

    if (!normalizedRequest) {
      triggers.push("empty_request");
      return {
        decision: "flag",
        scope: "uncertain",
        confidence: 0.9,
        reason: "The request content is empty or invalid and needs manual handling.",
        triggers,
        policyVersion: "v1",
      };
    }

    const majorIntentMatch = MAJOR_REQUEST_PATTERNS.find((pattern) =>
      pattern.test(normalizedRequest)
    );
    if (majorIntentMatch) {
      triggers.push(`major_intent:${majorIntentMatch.source}`);
    }

    if (filesModified.length > 8) {
      triggers.push("wide_file_change_set");
    }

    const highRiskFile = filesModified.find((path) =>
      HIGH_RISK_FILE_PATTERNS.some((pattern) => pattern.test(path))
    );
    if (highRiskFile) {
      triggers.push(`high_risk_file:${highRiskFile}`);
    }

    if (triggers.length > 0) {
      const isUncertain = triggers.includes("agent_execution_error");
      return {
        decision: "flag",
        scope: isUncertain ? "uncertain" : "major",
        confidence: isUncertain ? 0.97 : 0.84,
        reason:
          "This request exceeds the safe auto-edit policy and should be reviewed before billing and implementation.",
        triggers,
        policyVersion: "v1",
      };
    }

    return {
      decision: "auto",
      scope: "minor",
      confidence: 0.92,
      reason: "Request appears to be a small, low-risk website content or styling update.",
      triggers,
      policyVersion: "v1",
    };
  }
}
