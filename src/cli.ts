import { formatCommandFailure, ProtonDriveError, redactCommandResult } from "./errors.js";
import { parseJsonOutput } from "./format.js";
import { resolveCliPath } from "./path.js";
import { ChildProcessRunner } from "./runner.js";
import { BackgroundCommandManager } from "./background.js";
import { installProtonDriveCli, type InstallCliResult } from "./installer.js";
import type {
  AuthStatus,
  BackgroundCommandSnapshot,
  CliRunner,
  CommandResult,
  ConflictStrategy,
  InviteRole,
  JsonCommandResult,
  NodeType,
  ProtonDriveCliOptions,
  PublicLinkRole,
} from "./types.js";

export class ProtonDriveCli {
  private readonly defaultTimeoutMs: number;
  private readonly authStatusCacheMs: number;
  private readonly runner: CliRunner;
  private readonly explicitCliPath: string | undefined;
  private readonly loginManager = new BackgroundCommandManager();
  private resolvedCliPath?: string;
  private authStatusCache: { expiresAt: number; value: AuthStatus } | undefined;

  constructor(options: ProtonDriveCliOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.authStatusCacheMs = options.authStatusCacheMs ?? authStatusCacheMsFromEnv();
    this.runner = options.runner ?? new ChildProcessRunner();
    this.explicitCliPath = options.cliPath;
  }

  async getCliPath(): Promise<string> {
    this.resolvedCliPath ??= await resolveCliPath(this.explicitCliPath, this.runner);
    return this.resolvedCliPath;
  }

  async installCli(options: { force?: boolean | undefined; installDir?: string | undefined; managePath?: boolean | undefined } = {}): Promise<InstallCliResult> {
    const installed = await installProtonDriveCli(options);
    this.resolvedCliPath = installed.path;
    this.clearAuthStatusCache();
    return installed;
  }

  async run(args: string[], options: { timeoutMs?: number | undefined; allowFailure?: boolean | undefined } = {}): Promise<CommandResult> {
    const cliPath = await this.getCliPath();
    const result = await this.runner.run(cliPath, args, {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
    });

    if (!options.allowFailure && result.exitCode !== 0) {
      const redactedResult = redactCommandResult(result);
      throw new ProtonDriveError(formatCommandFailure(redactedResult), { result: redactedResult, hint: authHint(result) });
    }

    return result;
  }

  async runJson<T = unknown>(args: string[], options: { timeoutMs?: number | undefined; allowFailure?: boolean | undefined } = {}): Promise<JsonCommandResult<T>> {
    const result = await this.run(withJsonFlag(args), options);
    const parsed = parseJsonOutput<T>(result);
    if (!options.allowFailure && parsed.parseError) {
      throw new ProtonDriveError(`Failed to parse proton-drive JSON output: ${parsed.parseError}`, { result: redactCommandResult(parsed) });
    }
    return parsed;
  }

  version(): Promise<CommandResult> {
    return this.run(["version"]);
  }

  help(args: string[] = []): Promise<CommandResult> {
    return this.run([...args, "-h"]);
  }

  async startAuthLogin(options: { captureMs?: number | undefined; maxSessionMs?: number | undefined } = {}): Promise<BackgroundCommandSnapshot> {
    const cliPath = await this.getCliPath();
    this.clearAuthStatusCache();
    return this.loginManager.start(cliPath, ["auth", "login"], {
      captureMs: options.captureMs ?? 3_000,
      maxSessionMs: options.maxSessionMs ?? 600_000,
    });
  }

  authLoginSnapshot(): BackgroundCommandSnapshot | undefined {
    return this.loginManager.snapshot();
  }

  cancelAuthLogin(): BackgroundCommandSnapshot | undefined {
    return this.loginManager.cancel();
  }

  authLogout(): Promise<CommandResult> {
    this.clearAuthStatusCache();
    return this.run(["auth", "logout"], { allowFailure: true });
  }

  async authStatus(options: { fresh?: boolean | undefined } = {}): Promise<AuthStatus> {
    if (!options.fresh && this.authStatusCache && this.authStatusCache.expiresAt > Date.now()) {
      return { ...this.authStatusCache.value, cached: true };
    }

    const cliPath = await this.getCliPath();
    const result = await this.runJson(["filesystem", "list", "/my-files"], { timeoutMs: 30_000, allowFailure: true });
    const authenticated = result.exitCode === 0 && !result.parseError;
    const status: AuthStatus = {
      authenticated,
      cliPath,
      detail: authenticated ? "Authenticated. The CLI can list /my-files." : authHint(result) ?? "Not authenticated or Proton Drive CLI is unavailable.",
      result,
      cached: false,
    };
    if (authenticated && this.authStatusCacheMs > 0) {
      this.authStatusCache = { expiresAt: Date.now() + this.authStatusCacheMs, value: status };
    }
    return status;
  }

  list(path: string, type?: NodeType) {
    const args = ["filesystem", "list"];
    if (type) args.push("-t", type);
    args.push(path);
    return this.runJson(args);
  }

  info(path: string) {
    return this.runJson(["filesystem", "info", path]);
  }

  createFolder(parentPath: string, name: string) {
    return this.runJson(["filesystem", "create-folder", parentPath, name]);
  }

  upload(input: {
    localPaths: string[];
    parentPath: string;
    conflictStrategy?: ConflictStrategy | undefined;
    fileConflictStrategy?: ConflictStrategy | undefined;
    folderConflictStrategy?: ConflictStrategy | undefined;
    skipThumbnails?: boolean | undefined;
    timeoutMs?: number | undefined;
  }) {
    const args = ["filesystem", "upload"];
    pushOptional(args, "-c", input.conflictStrategy);
    pushOptional(args, "-f", input.fileConflictStrategy);
    pushOptional(args, "-d", input.folderConflictStrategy);
    if (input.skipThumbnails) args.push("-t");
    args.push(...input.localPaths, input.parentPath);
    return this.runJson(args, { timeoutMs: input.timeoutMs });
  }

  download(input: {
    paths: string[];
    localFolder: string;
    conflictStrategy?: ConflictStrategy | undefined;
    fileConflictStrategy?: ConflictStrategy | undefined;
    folderConflictStrategy?: ConflictStrategy | undefined;
    timeoutMs?: number | undefined;
  }) {
    const args = ["filesystem", "download"];
    pushOptional(args, "-c", input.conflictStrategy);
    pushOptional(args, "-f", input.fileConflictStrategy);
    pushOptional(args, "-d", input.folderConflictStrategy);
    args.push(...input.paths, input.localFolder);
    return this.runJson(args, { timeoutMs: input.timeoutMs });
  }

  rename(path: string, newName: string) {
    return this.runJson(["filesystem", "rename", path, newName]);
  }

  copy(sourcePaths: string[], targetParentPath: string, name?: string) {
    const args = ["filesystem", "copy"];
    pushOptional(args, "-n", name);
    args.push(...sourcePaths, targetParentPath);
    return this.runJson(args);
  }

  move(sourcePaths: string[], targetParentPath: string) {
    return this.runJson(["filesystem", "move", ...sourcePaths, targetParentPath]);
  }

  trash(paths: string[]) {
    return this.runJson(["filesystem", "trash", ...paths]);
  }

  restore(paths: string[]) {
    return this.runJson(["filesystem", "restore", ...paths]);
  }

  delete(paths: string[]) {
    return this.runJson(["filesystem", "delete", ...paths]);
  }

  emptyTrash() {
    return this.runJson(["filesystem", "empty-trash"]);
  }

  sharingStatus(path: string) {
    return this.runJson(["sharing", "status", path]);
  }

  sharingInvite(input: { path: string; users: string[]; role?: InviteRole | undefined; message?: string | undefined; includeNodeName?: boolean | undefined }) {
    const args = ["sharing", "invite"];
    for (const user of input.users) args.push("-u", user);
    pushOptional(args, "-r", input.role);
    pushOptional(args, "-m", input.message);
    if (input.includeNodeName) args.push("-n");
    args.push(input.path);
    return this.runJson(args);
  }

  sharingRemove(input: { path: string; emails?: string[] | undefined; all?: boolean | undefined }) {
    const emails = input.emails ?? [];
    if (emails.length === 0 && !input.all) {
      throw new Error("sharingRemove requires either at least one email or all=true.");
    }
    if (emails.length > 0 && input.all) {
      throw new Error("sharingRemove accepts either emails or all=true, not both.");
    }

    const args = ["sharing", "remove"];
    for (const email of emails) args.push("-e", email);
    if (input.all) args.push("-a");
    args.push(input.path);
    return this.runJson(args);
  }

  sharingSetUrl(input: { path: string; role?: PublicLinkRole | undefined; expiration?: string | undefined }) {
    const args = ["sharing", "set-url"];
    pushOptional(args, "--role", input.role);
    pushOptional(args, "--expiration", input.expiration);
    args.push(input.path);
    return this.runJson(args);
  }

  sharingRemoveUrl(path: string) {
    return this.runJson(["sharing", "remove-url", path]);
  }

  invitationList() {
    return this.runJson(["invitation", "list"]);
  }

  invitationAccept(invitationUid: string) {
    return this.runJson(["invitation", "accept", invitationUid]);
  }

  invitationReject(invitationUid: string) {
    return this.runJson(["invitation", "reject", invitationUid]);
  }

  private clearAuthStatusCache(): void {
    this.authStatusCache = undefined;
  }
}

function pushOptional(args: string[], flag: string, value: string | undefined): void {
  if (value) args.push(flag, value);
}

function authStatusCacheMsFromEnv(): number {
  const parsed = Number(process.env.PROTON_DRIVE_AUTH_STATUS_CACHE_MS ?? "5000");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5_000;
}

function withJsonFlag(args: string[]): string[] {
  const [group, command, ...rest] = args;
  if (!group || !command) return [...args, "-j"];
  return [group, command, "-j", ...rest];
}

function authHint(result: CommandResult): string | undefined {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (result.timedOut) {
    return "The command timed out. If this was auth login, finish the browser sign-in and then call proton_drive_auth_status.";
  }
  if (text.includes("auth") || text.includes("login") || text.includes("session") || text.includes("unauthorized")) {
    return "Run proton_drive_auth_login to start the browser login flow, then call proton_drive_auth_status.";
  }
  return undefined;
}
