import type { BackgroundCommandSnapshot, CommandResult, JsonCommandResult } from "./types.js";

const BACKGROUND_OUTPUT_PREVIEW_CHARS = 4_000;
const BACKGROUND_JSON_ARRAY_ITEMS = 50;

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

export function formatBackgroundSnapshot(snapshot: BackgroundCommandSnapshot) {
  const stdout = snapshot.stdout.trim();
  const stderr = snapshot.stderr.trim();
  const parsed = snapshot.state === "completed" && stdout ? tryParseJson(stdout) : undefined;
  const stdoutPreview = parsed === undefined ? previewText(stdout) : { text: "", truncated: stdout.length > 0 };
  const stderrPreview = previewText(stderr);
  return {
    jobId: snapshot.jobId,
    kind: snapshot.kind,
    label: snapshot.label,
    state: snapshot.state,
    pid: snapshot.pid,
    durationMs: snapshot.durationMs,
    exitCode: snapshot.exitCode,
    signal: snapshot.signal,
    timedOut: snapshot.timedOut,
    output: {
      stdoutBytes: Buffer.byteLength(stdout),
      stderrBytes: Buffer.byteLength(stderr),
      stdout: stdoutPreview.text,
      stdoutTruncated: stdoutPreview.truncated,
      stdoutSuppressedBecauseJsonParsed: parsed !== undefined && stdout.length > 0,
      stderr: stderrPreview.text,
      stderrTruncated: stderrPreview.truncated,
    },
    json: parsed === undefined ? undefined : summarizeJson(parsed),
  };
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function previewText(text: string): { text: string; truncated: boolean } {
  if (text.length <= BACKGROUND_OUTPUT_PREVIEW_CHARS) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, BACKGROUND_OUTPUT_PREVIEW_CHARS),
    truncated: true,
  };
}

function summarizeJson(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  const items = value.slice(0, BACKGROUND_JSON_ARRAY_ITEMS).map(summarizeJsonArrayItem);
  return {
    items,
    totalItems: value.length,
    returnedItems: items.length,
    limit: BACKGROUND_JSON_ARRAY_ITEMS,
    truncated: items.length < value.length,
  };
}

function summarizeJsonArrayItem(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  assignIfPresent(summary, "uid", record.uid);
  assignIfPresent(summary, "ok", record.ok);
  assignIfPresent(summary, "name", normalizeName(record.name));
  assignIfPresent(summary, "type", record.type);
  assignIfPresent(summary, "mediaType", record.mediaType);
  assignIfPresent(summary, "totalStorageSize", record.totalStorageSize);
  assignIfPresent(summary, "isShared", record.isShared);
  assignIfPresent(summary, "isSharedPublicly", record.isSharedPublicly);
  assignIfPresent(summary, "creationTime", record.creationTime);
  assignIfPresent(summary, "modificationTime", record.modificationTime);

  return Object.keys(summary).length > 0 ? summary : value;
}

function normalizeName(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return typeof record.value === "string" ? record.value : value;
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}
