#!/usr/bin/env node
import { readDecisionLog, renderMarkdown, validateDecisionLog } from "../src/index.js";

const [command, filePath, ...args] = process.argv.slice(2);

if (["-h", "--help"].includes(command)) {
  printHelp();
  process.exit(0);
}

if (!command) {
  printHelp();
  process.exit(1);
}

const knownCommand = ["validate", "render"].includes(command);
if (knownCommand && ["-h", "--help"].includes(filePath)) {
  printHelp();
  process.exit(0);
}

if (knownCommand && !filePath) {
  process.stderr.write(`Missing required <file> for ${command}.\n`);
  printHelp();
  process.exit(1);
}

try {
  let format;
  if (command === "validate") {
    rejectUnexpectedArgs(args);
  } else if (command === "render") {
    format = parseRenderFormat(args);
    if (!["markdown", "json"].includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  const log = readDecisionLog(filePath);
  if (command === "validate") {
    const result = validateDecisionLog(log);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (command === "render") {
    const validation = validateDecisionLog(log);
    if (format === "markdown") {
      process.stdout.write(renderMarkdown(log, validation));
      process.exit(validation.ok ? 0 : 1);
    }
    if (format === "json") {
      process.stdout.write(`${JSON.stringify({ decision: log, validation }, null, 2)}\n`);
      process.exit(validation.ok ? 0 : 1);
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function rejectUnexpectedArgs(args) {
  if (args.length > 0) {
    throw new Error(`Unexpected argument${args.length === 1 ? "" : "s"}: ${args.join(" ")}`);
  }
}

function parseRenderFormat(args) {
  if (args.length === 0) {
    return "markdown";
  }
  if (args[0] !== "--format") {
    throw new Error(`Unexpected argument${args.length === 1 ? "" : "s"}: ${args.join(" ")}`);
  }
  if (args.length === 1 || args[1].startsWith("-")) {
    throw new Error("Option --format requires a value (markdown or json).");
  }
  if (args.length > 2) {
    throw new Error(`Unexpected argument${args.length === 3 ? "" : "s"}: ${args.slice(2).join(" ")}`);
  }
  return args[1];
}

function printHelp() {
  process.stdout.write(`agent-decision-log

Usage:
  agent-decision-log validate <file>
  agent-decision-log render <file> [--format markdown|json]
`);
}
