export type ConflictStrategy = "merge" | "keep-both" | "replace" | "skip";
export type NodeType = "file" | "folder" | "album" | "photo";
export type InviteRole = "viewer" | "editor" | "admin";
export type PublicLinkRole = "viewer" | "editor";
export type BackgroundJobKind = "auth_login" | "list" | "upload" | "download";

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
  versionCacheMs?: number | undefined;
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
  jobId?: string | undefined;
  kind?: BackgroundJobKind | undefined;
  label?: string | undefined;
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

export interface DiagnoseResult {
  ready: boolean;
  nextAction: string;
  cli: {
    path: string | null;
    found: boolean;
    managedPath: string;
    managedInstalled: boolean;
    autoInstallEnabled: boolean;
    pathDirectoryOnPath: boolean;
    version: string | null;
    versionCached: boolean;
    error: string | null;
  };
  auth: {
    checked: boolean;
    authenticated: boolean | null;
    cached: boolean;
    detail: string | null;
    durationMs: number | null;
  };
  install?: unknown;
  durationMs: number;
}

export interface ReadTextResult {
  path: string;
  bytes: number;
  encoding: "utf-8";
  text: string;
}

export interface WriteTextResult {
  path: string;
  parentPath: string;
  name: string;
  bytes: number;
  result: JsonCommandResult;
}
