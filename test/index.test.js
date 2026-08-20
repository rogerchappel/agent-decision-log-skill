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
