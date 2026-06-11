import type { BackgroundCommandSnapshot, CommandResult, JsonCommandResult } from "./types.js";

export function parseJsonOutput<T = unknown>(result: CommandResult): JsonCommandResult<T> {
  const trimmed = result.stdout.trim();
  if (!trimmed) {
    return { ...result, json: null };
  }

  try {
    return { ...result, json: JSON.parse(trimmed) as T };
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    return { ...result, json: null, parseError };
  }
}

export function prettyResult(result: CommandResult | JsonCommandResult): string {
  const maybeJson = "json" in result ? result.json : undefined;
  if (maybeJson !== undefined && maybeJson !== null) {
    return JSON.stringify(maybeJson, null, 2);
  }

  const parts = [
    result.stdout.trim(),
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : "",
    result.timedOut ? "Command timed out." : "",
  ].filter(Boolean);

  return parts.join("\n\n") || "Command completed without output.";
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g);
  return matches ? [...new Set(matches)] : [];
}

export function formatAuthLoginSnapshot(snapshot: BackgroundCommandSnapshot) {
  return {
    status: snapshot.state === "running" ? "login_started" : snapshot.state,
    loginUrls: snapshot.loginUrls,
    pid: snapshot.pid,
    message:
      snapshot.loginUrls.length > 0
        ? "Open the login URL, finish Proton sign-in, then call proton_drive_auth_status."
        : snapshot.state === "running"
          ? "The Proton Drive CLI login flow is running in the background. Finish the browser sign-in if it opened, then call proton_drive_auth_status."
          : "The Proton Drive CLI login process has finished. Call proton_drive_auth_status to verify.",
    output: {
      exitCode: snapshot.exitCode,
      signal: snapshot.signal,
      timedOut: snapshot.timedOut,
      stdout: snapshot.stdout.trim(),
      stderr: snapshot.stderr.trim(),
      durationMs: snapshot.durationMs,
    },
  };
}
