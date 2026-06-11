import type { CommandResult } from "./types.js";

const SENSITIVE_OPTION_NAMES = new Set(["password", "passphrase", "secret", "token"]);

export class ProtonDriveError extends Error {
  readonly result: CommandResult | undefined;
  readonly hint: string | undefined;

  constructor(message: string, options: { result?: CommandResult | undefined; hint?: string | undefined } = {}) {
    super(message);
    this.name = "ProtonDriveError";
    this.result = options.result;
    this.hint = options.hint;
  }
}

export function formatCommandFailure(result: CommandResult): string {
  const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
  const suffix = output ? `\n\n${output}` : "";
  const status = result.timedOut ? "timed out" : `exited with code ${result.exitCode}`;
  return `proton-drive ${redactArgs(result.args).join(" ")} ${status}.${suffix}`;
}

export function redactCommandResult<T extends CommandResult>(result: T): T {
  return { ...result, args: redactArgs(result.args) };
}

export function redactArgs(args: string[]): string[] {
  const redacted: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const inlineMatch = arg.match(/^(--?)([^=\s]+)=(.*)$/);
    if (inlineMatch && isSensitiveOption(inlineMatch[2]!)) {
      redacted.push(`${inlineMatch[1]}${inlineMatch[2]}=[REDACTED]`);
      continue;
    }

    redacted.push(arg);
    if (isSensitiveFlag(arg) && index + 1 < args.length) {
      redacted.push("[REDACTED]");
      index++;
    }
  }

  return redacted;
}

function isSensitiveFlag(arg: string): boolean {
  const normalized = arg.replace(/^-+/, "").toLowerCase();
  return SENSITIVE_OPTION_NAMES.has(normalized);
}

function isSensitiveOption(name: string): boolean {
  return SENSITIVE_OPTION_NAMES.has(name.toLowerCase());
}
