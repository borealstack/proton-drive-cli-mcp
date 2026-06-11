import { spawn } from "node:child_process";
import type { CliRunner, CommandResult, RunOptions } from "./types.js";

const MAX_OUTPUT_CHARS = 100_000;

export class ChildProcessRunner implements CliRunner {
  run(command: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout = appendWithCap(stdout, chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr = appendWithCap(stderr, chunk);
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          command,
          args,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      });
    });
  }
}

function appendWithCap(existing: string, chunk: string): string {
  const next = existing + chunk;
  return next.length <= MAX_OUTPUT_CHARS ? next : next.slice(next.length - MAX_OUTPUT_CHARS);
}
