import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("markdown render includes decision sections", () => {
  const rendered = renderMarkdown(valid);
  assert.match(rendered, /# Decision Log: Choose release candidate branch/);
  assert.match(rendered, /## Evidence/);
  assert.match(rendered, /npm test/);
});

test("CLI validate exits successfully for valid fixture", () => {
  const output = execFileSync("node", ["bin/agent-decision-log.js", "validate", "fixtures/decision.valid.json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  assert.match(output, /"ok": true/);
});

test("CLI validate rejects unknown and trailing options", () => {
  for (const extraArgs of [["--typo"], ["trailing", "arguments"]]) {
    const result = runCli(["validate", "fixtures/decision.valid.json", ...extraArgs]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unexpected arguments?:/);
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
