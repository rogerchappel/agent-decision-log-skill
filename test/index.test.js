import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderMarkdown, validateDecisionLog } from "../src/index.js";

const valid = JSON.parse(readFileSync(new URL("../fixtures/decision.valid.json", import.meta.url), "utf8"));
const invalid = JSON.parse(readFileSync(new URL("../fixtures/decision.invalid.json", import.meta.url), "utf8"));

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

