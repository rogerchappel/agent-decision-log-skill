import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderMarkdown, validateDecisionLog } from "../src/index.js";

const valid = JSON.parse(readFileSync(new URL("../fixtures/decision.valid.json", import.meta.url), "utf8"));
const invalid = JSON.parse(readFileSync(new URL("../fixtures/decision.invalid.json", import.meta.url), "utf8"));
const projectRoot = new URL("..", import.meta.url);

function runCli(args) {
  return spawnSync("node", ["bin/agent-decision-log.js", ...args], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

const cliUsage = `agent-decision-log

Usage:
  agent-decision-log validate <file>
  agent-decision-log render <file> [--format markdown|json]
`;

test("valid decision log passes validation", () => {
  const result = validateDecisionLog(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("invalid decision log reports actionable errors and warnings", () => {
  const result = validateDecisionLog(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /At least two options/);
  assert.match(result.errors.join("\n"), /At least one evidence/);
  assert.match(result.warnings.join("\n"), /Secret-looking value/);
});

test("non-object JSON roots return an explicit schema error", () => {
  for (const root of [null, "decision", 42, true, []]) {
    const result = validateDecisionLog(root);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["Decision log root must be a JSON object."]);
    assert.deepEqual(result.warnings, []);
  }
});

test("malformed nested collection entries return positioned shape errors", () => {
  const cases = [
    ["options", /Option 1 must be an object with name and tradeoffs fields/],
    ["evidence", /Evidence 1 must be an object with label and ref fields/],
    ["risks", /Risk 1 must be an object with level and description fields/],
    ["followups", /Follow-up 1 must be an object with owner and task fields/]
  ];

  for (const [collection, expected] of cases) {
    for (const entry of [null, "invalid", 42, true, []]) {
      const log = structuredClone(valid);
      log[collection] = collection === "options" ? [entry, valid.options[1]] : [entry];
      const result = validateDecisionLog(log);
      assert.equal(result.ok, false, `${collection} should reject ${JSON.stringify(entry)}`);
      assert.match(result.errors.join("\n"), expected);
    }
  }
});

test("option tradeoffs must be nonempty strings with positioned errors", () => {
  for (const tradeoff of [null, 42, {}, [], "", "   "]) {
    const log = structuredClone(valid);
    log.options[0].tradeoffs = ["fast", tradeoff];
    const result = validateDecisionLog(log);
    assert.equal(result.ok, false, `tradeoff should reject ${JSON.stringify(tradeoff)}`);
    assert.ok(result.errors.includes("Option 1 tradeoff 2 must be a nonempty string."));
  }
});

test("missing tradeoffs warnings use stable option labels", () => {
  for (const name of [{ invalid: true }, ["invalid"], null, "", "   "]) {
    for (const tradeoffs of [undefined, null, []]) {
      const log = structuredClone(valid);
      log.options[0] = { name };
      if (tradeoffs !== undefined) log.options[0].tradeoffs = tradeoffs;
      const result = validateDecisionLog(log);
      assert.ok(result.warnings.includes("Option 1 has no tradeoffs."));
      assert.doesNotMatch(result.warnings.join("\n"), /\[object Object\]|invalid/);
    }
  }
});

test("option names are unique after trimming, NFC normalization, and case folding", () => {
  const log = structuredClone(valid);
  log.options[0].name = "  RELEASE CANDIDATE BRANCH ";
  const result = validateDecisionLog(log);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("Option 2 has the same normalized name as option 1."));
});

test("chosen resolves by normalized name when options remain distinct", () => {
  const log = structuredClone(valid);
  log.chosen = "  RELEASE CANDIDATE BRANCH  ";
  const result = validateDecisionLog(log);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("markdown replaces invalid tradeoff values with a stable label", () => {
  const log = structuredClone(valid);
  log.options[0].tradeoffs = [null, 42, {}];
  const rendered = renderMarkdown(log);
  assert.match(rendered, /Invalid tradeoff entry/);
  assert.doesNotMatch(rendered, /\[object Object\]/);
});

test("markdown uses stable placeholders for invalid required scalar fields", () => {
  const placeholders = {
    id: "- ID: missing",
    title: "# Decision Log: Untitled",
    context: "Missing context.",
    chosen: "- Chosen: missing",
    rationale: "Missing rationale."
  };

  for (const [field, placeholder] of Object.entries(placeholders)) {
    for (const value of [{ invalid: true }, ["invalid"], 42, true, null]) {
      const log = structuredClone(valid);
      log[field] = value;
      const rendered = renderMarkdown(log);

      assert.match(rendered, new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(rendered, /\[object Object\]|invalid|\b42\b|\btrue\b/);
      assert.match(rendered, new RegExp(`error: Missing required string field: ${field}`));
    }
  }
});

test("markdown uses stable placeholders for invalid nested scalar fields", () => {
  const log = structuredClone(valid);
  log.options[0].name = { invalid: true };
  log.evidence[0] = { label: ["invalid"], ref: { invalid: true } };
  log.risks[0] = { level: { invalid: true }, description: ["invalid"] };
  log.followups[0] = { owner: { invalid: true }, task: ["invalid"] };

  const rendered = renderMarkdown(log);

  assert.match(rendered, /^- Unnamed option$/m);
  assert.match(rendered, /^- Evidence: missing ref$/m);
  assert.match(rendered, /^- unknown: missing description$/m);
  assert.match(rendered, /^- unowned: missing task$/m);
  assert.doesNotMatch(rendered, /\[object Object\]|invalid/);
  assert.match(rendered, /error: Option 1 is missing a name\./);
  assert.match(rendered, /error: Evidence 1 requires label and ref\./);
  assert.match(rendered, /error: Risk 1 requires a description\./);
  assert.match(rendered, /warning: Follow-up 1 should include owner and task\./);
});

test("markdown render includes decision sections", () => {
  const rendered = renderMarkdown(valid);
  assert.match(rendered, /# Decision Log: Choose release candidate branch/);
  assert.match(rendered, /## Evidence/);
  assert.match(rendered, /npm test/);
});

test("markdown render reports invalid roots without throwing", () => {
  for (const root of [null, [], "decision", 42, true]) {
    const rendered = renderMarkdown(root);
    assert.match(rendered, /Validation: fail/);
    assert.match(rendered, /error: Decision log root must be a JSON object\./);
  }
});

test("non-array decision collections return stable shape errors", () => {
  const expectedErrors = {
    options: "At least two options are required.",
    evidence: "At least one evidence entry is required.",
    risks: "Risks must be an array when provided.",
    followups: "Follow-ups must be an array when provided."
  };

  for (const [collection, expected] of Object.entries(expectedErrors)) {
    for (const value of [null, {}, "invalid", 42, true]) {
      const log = structuredClone(valid);
      log[collection] = value;
      const result = validateDecisionLog(log);
      assert.equal(result.ok, false);
      assert.ok(result.errors.includes(expected), `${collection} should reject ${JSON.stringify(value)}`);
    }
  }
});

test("CLI validate exits successfully for valid fixture", () => {
  const output = execFileSync("node", ["bin/agent-decision-log.js", "validate", "fixtures/decision.valid.json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  assert.match(output, /"ok": true/);
});

test("CLI top-level help succeeds on stdout", () => {
  for (const flag of ["-h", "--help"]) {
    const result = runCli([flag]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, cliUsage);
    assert.equal(result.stderr, "");
  }
});

test("CLI commands require a file and print a specific diagnostic with usage", () => {
  for (const command of ["validate", "render"]) {
    const result = runCli([command]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, cliUsage);
    assert.equal(result.stderr, `Missing required <file> for ${command}.\n`);
  }
});

test("CLI subcommand help succeeds without treating the flag as a file", () => {
  for (const command of ["validate", "render"]) {
    for (const flag of ["-h", "--help"]) {
      const result = runCli([command, flag]);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, cliUsage);
      assert.equal(result.stderr, "");
    }
  }
});

test("CLI validate rejects unknown and trailing options", () => {
  for (const extraArgs of [["--typo"], ["trailing", "arguments"]]) {
    const result = runCli(["validate", "fixtures/decision.valid.json", ...extraArgs]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unexpected arguments?:/);
  }
});

test("CLI rejects unknown commands before reading the input file", () => {
  const result = runCli(["nonsense", "missing.json"]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "Unknown command: nonsense\n");
  assert.doesNotMatch(result.stderr, /ENOENT|missing\.json/);
});

test("CLI validates command arguments before reading the input file", () => {
  const cases = [
    [["validate", "missing.json", "trailing"], "Unexpected argument: trailing\n"],
    [["render", "missing.json", "--format"], "Option --format requires a value (markdown or json).\n"],
    [["render", "missing.json", "--format", "yaml"], "Unsupported format: yaml\n"]
  ];

  for (const [args, expectedError] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, expectedError);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test("CLI render rejects unknown and trailing options", () => {
  for (const extraArgs of [["--typo"], ["--format", "json", "trailing"]]) {
    const result = runCli(["render", "fixtures/decision.valid.json", ...extraArgs]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unexpected argument:/);
  }
});

test("CLI render rejects a missing format value", () => {
  for (const args of [
    ["render", "fixtures/decision.valid.json", "--format"],
    ["render", "fixtures/decision.valid.json", "--format", "--typo"]
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "Option --format requires a value (markdown or json).\n");
  }
});

test("CLI render defaults to Markdown only when format is absent", () => {
  const result = runCli(["render", "fixtures/decision.valid.json"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^# Decision Log:/);
});

test("CLI validate and render report malformed entries without leaking TypeErrors", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-test-"));
  try {
    const cases = [
      ["options", /Option 1 must be an object with name and tradeoffs fields/],
      ["evidence", /Evidence 1 must be an object with label and ref fields/],
      ["risks", /Risk 1 must be an object with level and description fields/],
      ["followups", /Follow-up 1 must be an object with owner and task fields/]
    ];
    for (const [collection, expected] of cases) {
      const log = structuredClone(valid);
      log[collection] = collection === "options" ? [null, valid.options[1]] : [null];
      const file = join(directory, `${collection}.json`);
      writeFileSync(file, JSON.stringify(log));

      for (const args of [["validate", file], ["render", file], ["render", file, "--format", "json"]]) {
        const result = runCli(args);
        assert.equal(result.status, 1);
        assert.match(result.stdout, expected);
        assert.doesNotMatch(result.stderr, /TypeError/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI rejects malformed tradeoffs and duplicate normalized option names", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-options-test-"));
  try {
    const malformedTradeoffs = structuredClone(valid);
    malformedTradeoffs.options[0].tradeoffs = [null, 42, {}];
    const duplicateNames = structuredClone(valid);
    duplicateNames.options[0].name = " RELEASE CANDIDATE BRANCH ";

    for (const [name, log, expected] of [
      ["tradeoffs", malformedTradeoffs, /Option 1 tradeoff 1 must be a nonempty string/],
      ["duplicates", duplicateNames, /Option 2 has the same normalized name as option 1/]
    ]) {
      const file = join(directory, `${name}.json`);
      writeFileSync(file, JSON.stringify(log));
      for (const args of [["validate", file], ["render", file], ["render", file, "--format", "json"]]) {
        const result = runCli(args);
        assert.equal(result.status, 1);
        assert.match(result.stdout, expected);
        assert.doesNotMatch(result.stdout, /\[object Object\]/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI validation findings use positioned labels for invalid option names", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-option-label-test-"));
  try {
    for (const [index, name] of [{ invalid: true }, ["invalid"], null, "", "   "].entries()) {
      const log = structuredClone(valid);
      log.options[0] = { name, tradeoffs: index % 2 === 0 ? [] : null };
      const file = join(directory, `option-${index}.json`);
      writeFileSync(file, JSON.stringify(log));

      for (const args of [["validate", file], ["render", file], ["render", file, "--format", "json"]]) {
        const result = runCli(args);
        assert.equal(result.status, 1);
        assert.match(result.stdout, /Option 1 has no tradeoffs\./);
        assert.doesNotMatch(result.stdout, /\[object Object\]|warning: Option invalid/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI render reports invalid roots and collection shapes without leaking TypeErrors", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-render-test-"));
  try {
    const cases = [
      ["null-root", null, /Decision log root must be a JSON object/],
      ["array-root", [], /Decision log root must be a JSON object/],
      ["options-object", { ...valid, options: {} }, /At least two options are required/],
      ["evidence-object", { ...valid, evidence: {} }, /At least one evidence entry is required/],
      ["risks-object", { ...valid, risks: {} }, /Risks must be an array when provided/],
      ["followups-object", { ...valid, followups: {} }, /Follow-ups must be an array when provided/]
    ];

    for (const [name, log, expected] of cases) {
      const file = join(directory, `${name}.json`);
      writeFileSync(file, JSON.stringify(log));
      for (const formatArgs of [[], ["--format", "markdown"], ["--format", "json"]]) {
        const result = runCli(["render", file, ...formatArgs]);
        assert.equal(result.status, 1);
        assert.match(result.stdout, expected);
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /TypeError|not iterable|Cannot read properties/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI Markdown render uses stable placeholders for invalid required scalar fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-scalars-test-"));
  const file = join(directory, "invalid-scalars.json");
  try {
    writeFileSync(file, JSON.stringify({
      ...valid,
      id: { invalid: true },
      title: ["invalid"],
      context: 42,
      chosen: true,
      rationale: null
    }));

    const result = runCli(["render", file, "--format", "markdown"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^# Decision Log: Untitled/m);
    assert.match(result.stdout, /^- ID: missing$/m);
    assert.match(result.stdout, /^- Chosen: missing$/m);
    assert.match(result.stdout, /^Missing context\.$/m);
    assert.match(result.stdout, /^Missing rationale\.$/m);
    assert.doesNotMatch(result.stdout, /\[object Object\]|invalid|\b42\b|\btrue\b/);
    for (const field of ["id", "title", "context", "chosen", "rationale"]) {
      assert.match(result.stdout, new RegExp(`error: Missing required string field: ${field}`));
    }
    assert.equal(result.stderr, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI Markdown render preserves validation failure for invalid nested scalars", () => {
  const directory = mkdtempSync(join(tmpdir(), "decision-log-nested-scalars-test-"));
  const file = join(directory, "invalid-nested-scalars.json");
  try {
    const log = structuredClone(valid);
    log.options[0].name = { invalid: true };
    log.evidence[0] = { label: ["invalid"], ref: { invalid: true } };
    log.risks[0] = { level: { invalid: true }, description: ["invalid"] };
    log.followups[0] = { owner: { invalid: true }, task: ["invalid"] };
    writeFileSync(file, JSON.stringify(log));

    const result = runCli(["render", file, "--format", "markdown"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^- Unnamed option$/m);
    assert.match(result.stdout, /^- Evidence: missing ref$/m);
    assert.match(result.stdout, /^- unknown: missing description$/m);
    assert.match(result.stdout, /^- unowned: missing task$/m);
    assert.doesNotMatch(result.stdout, /\[object Object\]|invalid/);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
