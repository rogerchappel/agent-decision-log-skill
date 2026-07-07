#!/usr/bin/env node
import { normalizeDecisionLog, readDecisionLog, renderMarkdown, validateDecisionLog } from "../src/index.js";

const [command, filePath, ...args] = process.argv.slice(2);

if (!command || !filePath || ["-h", "--help"].includes(command)) {
  printHelp();
  process.exit(command ? 0 : 1);
}

try {
  const log = readDecisionLog(filePath);
  if (command === "validate") {
    const result = validateDecisionLog(log);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (command === "render") {
    const format = readOption(args, "--format") || "markdown";
    if (format === "markdown") {
      process.stdout.write(renderMarkdown(log));
      process.exit(0);
    }
    if (format === "json") {
      process.stdout.write(`${JSON.stringify(normalizeDecisionLog(log), null, 2)}\n`);
      process.exit(0);
    }
    throw new Error(`Unsupported format: ${format}`);
  }
  throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function printHelp() {
  process.stdout.write(`agent-decision-log

Usage:
  agent-decision-log validate <file>
  agent-decision-log render <file> --format markdown|json
`);
}

