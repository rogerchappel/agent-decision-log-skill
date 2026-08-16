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

  if (!log || typeof log !== "object" || Array.isArray(log)) {
    return {
      ok: false,
      errors: ["Decision log root must be a JSON object."],
      warnings
    };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(log[field])) {
      errors.push(`Missing required string field: ${field}`);
    }
  }

  if (!Array.isArray(log.options) || log.options.length < 2) {
    errors.push("At least two options are required.");
  } else {
    const optionNames = new Map();
    for (const [index, option] of log.options.entries()) {
      if (!isObjectEntry(option)) {
        errors.push(`Option ${index + 1} must be an object with name and tradeoffs fields.`);
        continue;
      }
      if (!isNonEmptyString(option.name)) {
        errors.push(`Option ${index + 1} is missing a name.`);
      } else {
        const normalizedName = normalizeOptionName(option.name);
        if (optionNames.has(normalizedName)) {
          errors.push(
            `Option ${index + 1} has the same normalized name as option ${optionNames.get(normalizedName)}.`
          );
        } else {
          optionNames.set(normalizedName, index + 1);
        }
      }
      if (!Array.isArray(option.tradeoffs) || option.tradeoffs.length === 0) {
        warnings.push(`Option ${option.name || index + 1} has no tradeoffs.`);
      } else {
        for (const [tradeoffIndex, tradeoff] of option.tradeoffs.entries()) {
          if (!isNonEmptyString(tradeoff)) {
            errors.push(`Option ${index + 1} tradeoff ${tradeoffIndex + 1} must be a nonempty string.`);
          }
        }
      }
    }
    if (isNonEmptyString(log.chosen) && !optionNames.has(normalizeOptionName(log.chosen))) {
      errors.push(`Chosen option "${log.chosen}" does not match any option name.`);
    }
  }

  if (!Array.isArray(log.evidence) || log.evidence.length === 0) {
    errors.push("At least one evidence entry is required.");
  } else {
    for (const [index, item] of log.evidence.entries()) {
      if (!isObjectEntry(item)) {
        errors.push(`Evidence ${index + 1} must be an object with label and ref fields.`);
        continue;
      }
      if (!isNonEmptyString(item.label) || !isNonEmptyString(item.ref)) {
        errors.push(`Evidence ${index + 1} requires label and ref.`);
      }
    }
  }

  if (log.risks !== undefined && !Array.isArray(log.risks)) {
    errors.push("Risks must be an array when provided.");
  } else if (Array.isArray(log.risks)) {
    for (const [index, risk] of log.risks.entries()) {
      if (!isObjectEntry(risk)) {
        errors.push(`Risk ${index + 1} must be an object with level and description fields.`);
        continue;
      }
      if (!["low", "medium", "high"].includes(risk.level)) {
        warnings.push(`Risk ${index + 1} should use level low, medium, or high.`);
      }
      if (!isNonEmptyString(risk.description)) {
        errors.push(`Risk ${index + 1} requires a description.`);
      }
    }
  }

  if (log.followups !== undefined && !Array.isArray(log.followups)) {
    errors.push("Follow-ups must be an array when provided.");
  } else if (Array.isArray(log.followups)) {
    for (const [index, followup] of log.followups.entries()) {
      if (!isObjectEntry(followup)) {
        errors.push(`Follow-up ${index + 1} must be an object with owner and task fields.`);
        continue;
      }
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
  const decision = isObjectEntry(log) ? log : {};
  const lines = [
    `# Decision Log: ${decision.title || "Untitled"}`,
    "",
    `- ID: ${decision.id || "missing"}`,
    `- Chosen: ${decision.chosen || "missing"}`,
    `- Validation: ${validation.ok ? "pass" : "fail"}`,
    "",
    "## Context",
    "",
    decision.context || "Missing context.",
    "",
    "## Options",
    ""
  ];

  for (const option of arrayOrEmpty(decision.options)) {
    if (!isObjectEntry(option)) {
      lines.push("- Invalid option entry");
      continue;
    }
    lines.push(`- ${option.name || "Unnamed option"}`);
    for (const tradeoff of arrayOrEmpty(option.tradeoffs)) {
      lines.push(`  - ${isNonEmptyString(tradeoff) ? tradeoff : "Invalid tradeoff entry"}`);
    }
  }

  lines.push("", "## Rationale", "", decision.rationale || "Missing rationale.", "", "## Evidence", "");
  for (const item of arrayOrEmpty(decision.evidence)) {
    if (!isObjectEntry(item)) {
      lines.push("- Invalid evidence entry");
      continue;
    }
    lines.push(`- ${item.label || "Evidence"}: ${item.ref || "missing ref"}`);
  }

  lines.push("", "## Risks", "");
  for (const risk of arrayOrEmpty(decision.risks)) {
    if (!isObjectEntry(risk)) {
      lines.push("- Invalid risk entry");
      continue;
    }
    lines.push(`- ${risk.level || "unknown"}: ${risk.description || "missing description"}`);
  }
  if (!Array.isArray(decision.risks) || decision.risks.length === 0) {
    lines.push("- none recorded");
  }

  lines.push("", "## Follow-ups", "");
  for (const followup of arrayOrEmpty(decision.followups)) {
    if (!isObjectEntry(followup)) {
      lines.push("- Invalid follow-up entry");
      continue;
    }
    lines.push(`- ${followup.owner || "unowned"}: ${followup.task || "missing task"}`);
  }
  if (!Array.isArray(decision.followups) || decision.followups.length === 0) {
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

function normalizeOptionName(value) {
  return value.trim().normalize("NFC").toLocaleLowerCase("en-US");
}

function isObjectEntry(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}
