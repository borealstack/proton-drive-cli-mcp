export type ConflictStrategy = "merge" | "keep-both" | "replace" | "skip";
export type NodeType = "file" | "folder" | "album" | "photo";
export type InviteRole = "viewer" | "editor" | "admin";
export type PublicLinkRole = "viewer" | "editor";

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface CliRunner {
  run(command: string, args: string[], options?: RunOptions): Promise<CommandResult>;
}

export interface RunOptions {
  timeoutMs?: number | undefined;
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface ProtonDriveCliOptions {
  cliPath?: string | undefined;
  defaultTimeoutMs?: number | undefined;
  authStatusCacheMs?: number | undefined;
  runner?: CliRunner | undefined;
}

export interface JsonCommandResult<T = unknown> extends CommandResult {
  json: T | null;
  parseError?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  cliPath: string;
  detail: string;
  result: JsonCommandResult;
  cached: boolean;
}

export type BackgroundCommandState = "running" | "completed" | "failed" | "timed_out";

export interface BackgroundCommandSnapshot {
  command: string;
  args: string[];
  pid: number | undefined;
  state: BackgroundCommandState;
  stdout: string;
  stderr: string;
  exitCode: number | null | undefined;
  signal: NodeJS.Signals | null | undefined;
  durationMs: number;
  timedOut: boolean;
  loginUrls: string[];
}
