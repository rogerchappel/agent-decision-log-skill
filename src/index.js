import fs from "node:fs";

const REQUIRED_STRING_FIELDS = ["id", "title", "context", "chosen", "rationale"];
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /gh[opsu]_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /password\s*[:=]\s*\S+/i,
  /token\s*[:=]\s*\S+/i
];

export function readDecisionLog(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const issue = new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    issue.code = "INVALID_JSON";
    throw issue;
  }
}

export function validateDecisionLog(log) {
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(log[field])) {
      errors.push(`Missing required string field: ${field}`);
    }
  }

  if (!Array.isArray(log.options) || log.options.length < 2) {
    errors.push("At least two options are required.");
  } else {
    const optionNames = new Set();
    for (const [index, option] of log.options.entries()) {
      if (!isNonEmptyString(option.name)) {
        errors.push(`Option ${index + 1} is missing a name.`);
      } else {
        optionNames.add(option.name);
      }
      if (!Array.isArray(option.tradeoffs) || option.tradeoffs.length === 0) {
        warnings.push(`Option ${option.name || index + 1} has no tradeoffs.`);
      }
    }
    if (isNonEmptyString(log.chosen) && !optionNames.has(log.chosen)) {
      errors.push(`Chosen option "${log.chosen}" does not match any option name.`);
    }
  }

  if (!Array.isArray(log.evidence) || log.evidence.length === 0) {
    errors.push("At least one evidence entry is required.");
  } else {
    for (const [index, item] of log.evidence.entries()) {
      if (!isNonEmptyString(item.label) || !isNonEmptyString(item.ref)) {
        errors.push(`Evidence ${index + 1} requires label and ref.`);
      }
    }
  }

  if (Array.isArray(log.risks)) {
    for (const [index, risk] of log.risks.entries()) {
      if (!["low", "medium", "high"].includes(risk.level)) {
        warnings.push(`Risk ${index + 1} should use level low, medium, or high.`);
      }
      if (!isNonEmptyString(risk.description)) {
        errors.push(`Risk ${index + 1} requires a description.`);
      }
    }
  }

  if (Array.isArray(log.followups)) {
    for (const [index, followup] of log.followups.entries()) {
      if (!isNonEmptyString(followup.owner) || !isNonEmptyString(followup.task)) {
        warnings.push(`Follow-up ${index + 1} should include owner and task.`);
      }
    }
  }

  for (const finding of findSecretLikeValues(log)) {
    warnings.push(`Secret-looking value at ${finding.path}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function renderMarkdown(log, validation = validateDecisionLog(log)) {
  const lines = [
    `# Decision Log: ${log.title || "Untitled"}`,
    "",
    `- ID: ${log.id || "missing"}`,
    `- Chosen: ${log.chosen || "missing"}`,
    `- Validation: ${validation.ok ? "pass" : "fail"}`,
    "",
    "## Context",
    "",
    log.context || "Missing context.",
    "",
    "## Options",
    ""
  ];

  for (const option of log.options || []) {
    lines.push(`- ${option.name || "Unnamed option"}`);
    for (const tradeoff of option.tradeoffs || []) {
      lines.push(`  - ${tradeoff}`);
    }
  }

  lines.push("", "## Rationale", "", log.rationale || "Missing rationale.", "", "## Evidence", "");
  for (const item of log.evidence || []) {
    lines.push(`- ${item.label || "Evidence"}: ${item.ref || "missing ref"}`);
  }

  lines.push("", "## Risks", "");
  for (const risk of log.risks || []) {
    lines.push(`- ${risk.level || "unknown"}: ${risk.description || "missing description"}`);
  }
  if (!Array.isArray(log.risks) || log.risks.length === 0) {
    lines.push("- none recorded");
  }

  lines.push("", "## Follow-ups", "");
  for (const followup of log.followups || []) {
    lines.push(`- ${followup.owner || "unowned"}: ${followup.task || "missing task"}`);
  }
  if (!Array.isArray(log.followups) || log.followups.length === 0) {
    lines.push("- none recorded");
  }

  if (validation.errors.length || validation.warnings.length) {
    lines.push("", "## Validation Findings", "");
    for (const error of validation.errors) {
      lines.push(`- error: ${error}`);
    }
    for (const warning of validation.warnings) {
      lines.push(`- warning: ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function normalizeDecisionLog(log) {
  const validation = validateDecisionLog(log);
  return {
    decision: log,
    validation
  };
}

function findSecretLikeValues(value, path = "$") {
  const findings = [];
  if (typeof value === "string") {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
      findings.push({ path });
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findings.push(...findSecretLikeValues(entry, `${path}[${index}]`));
    });
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      findings.push(...findSecretLikeValues(entry, `${path}.${key}`));
    }
  }
  return findings;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

