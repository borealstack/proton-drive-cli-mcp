import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatCommandFailure, ProtonDriveError, redactCommandResult } from "./errors.js";
import { parseJsonOutput } from "./format.js";
import { resolveCliPath } from "./path.js";
import { ChildProcessRunner } from "./runner.js";
import { BackgroundCommandManager, BackgroundJobManager } from "./background.js";
import { defaultInstallDir, installProtonDriveCli, managedCliPath, type InstallCliResult } from "./installer.js";
import type {
  AuthStatus,
  BackgroundCommandSnapshot,
  BackgroundJobKind,
  CliRunner,
  CommandResult,
  ConflictStrategy,
  DiagnoseResult,
  InviteRole,
  JsonCommandResult,
  NodeType,
  ProtonDriveCliOptions,
  PublicLinkRole,
  ReadTextResult,
  WriteTextResult,
} from "./types.js";

export class ProtonDriveCli {
  private readonly defaultTimeoutMs: number;
  private readonly authStatusCacheMs: number;
  private readonly versionCacheMs: number;
  private readonly runner: CliRunner;
  private readonly explicitCliPath: string | undefined;
  private readonly loginManager = new BackgroundCommandManager();
  private readonly jobManager = new BackgroundJobManager();
  private resolvedCliPath?: string;
  private authStatusCache: { expiresAt: number; value: AuthStatus } | undefined;
  private versionCache: { expiresAt: number; value: CommandResult } | undefined;

  constructor(options: ProtonDriveCliOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.authStatusCacheMs = options.authStatusCacheMs ?? authStatusCacheMsFromEnv();
    this.versionCacheMs = options.versionCacheMs ?? versionCacheMsFromEnv();
    this.runner = options.runner ?? new ChildProcessRunner();
    this.explicitCliPath = options.cliPath;
  }

  async getCliPath(options: { autoInstall?: boolean | undefined; fallbackToCommand?: boolean | undefined } = {}): Promise<string> {
    if (this.resolvedCliPath && options.autoInstall !== false && options.fallbackToCommand !== false) {
      return this.resolvedCliPath;
    }

    const resolved = await resolveCliPath(this.explicitCliPath, this.runner, options);
    if (options.fallbackToCommand !== false || resolved !== "proton-drive") {
      this.resolvedCliPath = resolved;
    }
    return resolved;
  }

  async installCli(options: { force?: boolean | undefined; installDir?: string | undefined; managePath?: boolean | undefined } = {}): Promise<InstallCliResult> {
    const installed = await installProtonDriveCli(options);
    this.resolvedCliPath = installed.path;
    this.clearAuthStatusCache();
    this.versionCache = undefined;
    return installed;
  }

  async run(args: string[], options: { timeoutMs?: number | undefined; allowFailure?: boolean | undefined } = {}): Promise<CommandResult> {
    const cliPath = await this.getCliPath();
    const result = await this.runWithPath(cliPath, args, options);

    if (!options.allowFailure && result.exitCode !== 0) {
      const redactedResult = redactCommandResult(result);
      throw new ProtonDriveError(formatCommandFailure(redactedResult), { result: redactedResult, hint: authHint(result) });
    }

    return result;
  }

  async runJson<T = unknown>(args: string[], options: { timeoutMs?: number | undefined; allowFailure?: boolean | undefined } = {}): Promise<JsonCommandResult<T>> {
    return this.parseJsonResult(await this.run(withJsonFlag(args), options), options);
  }

  async version(options: { fresh?: boolean | undefined } = {}): Promise<CommandResult> {
    if (!options.fresh && this.versionCache && this.versionCache.expiresAt > Date.now()) {
      return { ...this.versionCache.value };
    }

    const result = await this.run(["version"]);
    if (result.exitCode === 0 && this.versionCacheMs > 0) {
      this.versionCache = { expiresAt: Date.now() + this.versionCacheMs, value: result };
    }
    return result;
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

  setup(options: { installIfMissing?: boolean | undefined; includeAuth?: boolean | undefined; fresh?: boolean | undefined; managePath?: boolean | undefined } = {}): Promise<DiagnoseResult> {
    return this.diagnose({ ...options, installIfMissing: options.installIfMissing ?? true });
  }

  async diagnose(options: { installIfMissing?: boolean | undefined; includeAuth?: boolean | undefined; fresh?: boolean | undefined; managePath?: boolean | undefined } = {}): Promise<DiagnoseResult> {
    const startedAt = Date.now();
    const includeAuth = options.includeAuth ?? true;
    const managedPath = managedCliPath();
    const managedInstalled = await pathExists(managedPath);
    const autoInstallEnabled = process.env.PROTON_DRIVE_CLI_AUTO_INSTALL !== "0";
    let cliPath: string | null = null;
    let cliError: string | null = null;
    let installResult: InstallCliResult | undefined;

    try {
      cliPath = await this.getCliPath({ autoInstall: false, fallbackToCommand: false });
    } catch (error) {
      cliError = error instanceof Error ? error.message : String(error);
    }

    if (!cliPath && options.installIfMissing) {
      try {
        installResult = await this.installCli({ managePath: options.managePath });
        cliPath = installResult.path;
        cliError = null;
      } catch (error) {
        cliError = error instanceof Error ? error.message : String(error);
      }
    }

    const installDir = cliPath ? path.dirname(cliPath) : defaultInstallDir();
    const pathDirectoryOnPath = pathListIncludes(process.env.PATH ?? "", installDir);
    let version: string | null = null;
    let versionCached = false;
    if (cliPath) {
      const cachedBefore = !!this.versionCache && this.versionCache.expiresAt > Date.now();
      try {
        const versionResult = await this.version({ fresh: options.fresh });
        versionCached = cachedBefore && !options.fresh;
        version = versionResult.exitCode === 0 ? versionResult.stdout.trim() || null : null;
      } catch (error) {
        cliError = error instanceof Error ? error.message : String(error);
      }
    }

    let auth: DiagnoseResult["auth"] = {
      checked: false,
      authenticated: null,
      cached: false,
      detail: null,
      durationMs: null,
    };
    if (includeAuth && cliPath) {
      const authStartedAt = Date.now();
      const status = await this.authStatus({ fresh: options.fresh });
      auth = {
        checked: true,
        authenticated: status.authenticated,
        cached: status.cached,
        detail: status.detail,
        durationMs: Date.now() - authStartedAt,
      };
    }

    const ready = !!cliPath && auth.authenticated === true;
    const nextAction = ready
      ? "Ready. Proton Drive MCP can use the official CLI."
      : !cliPath
        ? autoInstallEnabled
          ? "Run proton_drive_setup with installIfMissing=true, or set PROTON_DRIVE_CLI_PATH."
          : "Install the Proton Drive CLI or set PROTON_DRIVE_CLI_PATH. Auto-install is disabled."
        : auth.checked && auth.authenticated === false
          ? "Run proton_drive_auth_login, finish browser sign-in, then run proton_drive_diagnose again."
          : "Run proton_drive_auth_status or proton_drive_auth_login to finish setup.";

    return {
      ready,
      nextAction,
      cli: {
        path: cliPath,
        found: !!cliPath,
        managedPath,
        managedInstalled,
        autoInstallEnabled,
        pathDirectoryOnPath,
        version,
        versionCached,
        error: cliError,
      },
      auth,
      install: installResult,
      durationMs: Date.now() - startedAt,
    };
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

  list(path: string, type?: NodeType, options: { timeoutMs?: number | undefined } = {}) {
    return this.runJson(buildListArgs(path, type), options);
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
    return this.runJson(buildUploadArgs(input), { timeoutMs: input.timeoutMs });
  }

  download(input: {
    paths: string[];
    localFolder: string;
    conflictStrategy?: ConflictStrategy | undefined;
    fileConflictStrategy?: ConflictStrategy | undefined;
    folderConflictStrategy?: ConflictStrategy | undefined;
    timeoutMs?: number | undefined;
  }) {
    return this.runJson(buildDownloadArgs(input), { timeoutMs: input.timeoutMs });
  }

  async startListJob(input: { path: string; type?: NodeType | undefined; captureMs?: number | undefined; maxSessionMs?: number | undefined }): Promise<BackgroundCommandSnapshot> {
    return this.startJob("list", withJsonFlag(buildListArgs(input.path, input.type)), {
      captureMs: input.captureMs ?? 100,
      maxSessionMs: input.maxSessionMs ?? 120_000,
      label: input.path,
    });
  }

  async startUploadJob(input: {
    localPaths: string[];
    parentPath: string;
    conflictStrategy?: ConflictStrategy | undefined;
    fileConflictStrategy?: ConflictStrategy | undefined;
    folderConflictStrategy?: ConflictStrategy | undefined;
    skipThumbnails?: boolean | undefined;
    captureMs?: number | undefined;
    maxSessionMs?: number | undefined;
  }): Promise<BackgroundCommandSnapshot> {
    return this.startJob("upload", withJsonFlag(buildUploadArgs(input)), {
      captureMs: input.captureMs ?? 250,
      maxSessionMs: input.maxSessionMs ?? 3_600_000,
      label: input.parentPath,
    });
  }

  async startDownloadJob(input: {
    paths: string[];
    localFolder: string;
    conflictStrategy?: ConflictStrategy | undefined;
    fileConflictStrategy?: ConflictStrategy | undefined;
    folderConflictStrategy?: ConflictStrategy | undefined;
    captureMs?: number | undefined;
    maxSessionMs?: number | undefined;
  }): Promise<BackgroundCommandSnapshot> {
    return this.startJob("download", withJsonFlag(buildDownloadArgs(input)), {
      captureMs: input.captureMs ?? 250,
      maxSessionMs: input.maxSessionMs ?? 3_600_000,
      label: input.localFolder,
    });
  }

  jobSnapshot(jobId: string): BackgroundCommandSnapshot | undefined {
    return this.jobManager.snapshot(jobId);
  }

  jobSnapshots(): BackgroundCommandSnapshot[] {
    return this.jobManager.snapshots();
  }

  cancelJob(jobId: string): BackgroundCommandSnapshot | undefined {
    return this.jobManager.cancel(jobId);
  }

  async readText(input: { path: string; maxBytes?: number | undefined; timeoutMs?: number | undefined }): Promise<ReadTextResult> {
    const maxBytes = input.maxBytes ?? 262_144;
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "proton-drive-read-"));
    try {
      await this.download({
        paths: [input.path],
        localFolder: tempDir,
        conflictStrategy: "replace",
        timeoutMs: input.timeoutMs,
      });
      const files = await listFiles(tempDir);
      if (files.length !== 1) {
        throw new Error(`Expected one downloaded file for ${input.path}, found ${files.length}.`);
      }
      const file = files[0];
      if (!file) {
        throw new Error(`Expected one downloaded file for ${input.path}, found none.`);
      }
      const fileStat = await stat(file);
      if (fileStat.size > maxBytes) {
        throw new Error(`Refusing to read ${fileStat.size} bytes from ${input.path}; maxBytes is ${maxBytes}.`);
      }
      const buffer = await readFile(file);
      if (looksBinary(buffer)) {
        throw new Error(`Refusing to read ${input.path} as text because it appears to be binary.`);
      }
      return {
        path: input.path,
        bytes: buffer.byteLength,
        encoding: "utf-8",
        text: buffer.toString("utf8"),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async writeText(input: {
    path: string;
    text: string;
    maxBytes?: number | undefined;
    conflictStrategy?: ConflictStrategy | undefined;
    timeoutMs?: number | undefined;
  }): Promise<WriteTextResult> {
    const maxBytes = input.maxBytes ?? 262_144;
    const buffer = Buffer.from(input.text, "utf8");
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Refusing to write ${buffer.byteLength} bytes to ${input.path}; maxBytes is ${maxBytes}.`);
    }

    const { parentPath, name } = splitRemoteFilePath(input.path);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "proton-drive-write-"));
    try {
      const localFile = path.join(tempDir, name);
      await writeFile(localFile, buffer);
      const result = await this.upload({
        localPaths: [localFile],
        parentPath,
        conflictStrategy: input.conflictStrategy ?? "replace",
        timeoutMs: input.timeoutMs,
      });
      return {
        path: input.path,
        parentPath,
        name,
        bytes: buffer.byteLength,
        result,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
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

  private async startJob(
    kind: BackgroundJobKind,
    args: string[],
    options: { captureMs: number; maxSessionMs: number; label?: string | undefined },
  ): Promise<BackgroundCommandSnapshot> {
    const cliPath = await this.getCliPath();
    return this.jobManager.start(kind, cliPath, args, options);
  }

  private async runWithPath(command: string, args: string[], options: { timeoutMs?: number | undefined; allowFailure?: boolean | undefined } = {}): Promise<CommandResult> {
    const result = await this.runner.run(command, args, {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
    });

    if (!options.allowFailure && result.exitCode !== 0) {
      const redactedResult = redactCommandResult(result);
      throw new ProtonDriveError(formatCommandFailure(redactedResult), { result: redactedResult, hint: authHint(result) });
    }

    return result;
  }

  private parseJsonResult<T = unknown>(result: CommandResult, options: { allowFailure?: boolean | undefined } = {}): JsonCommandResult<T> {
    const parsed = parseJsonOutput<T>(result);
    if (!options.allowFailure && parsed.parseError) {
      throw new ProtonDriveError(`Failed to parse proton-drive JSON output: ${parsed.parseError}`, { result: redactCommandResult(parsed) });
    }
    return parsed;
  }
}

function buildListArgs(remotePath: string, type?: NodeType): string[] {
  const args = ["filesystem", "list"];
  if (type) args.push("-t", type);
  args.push(remotePath);
  return args;
}

function buildUploadArgs(input: {
  localPaths: string[];
  parentPath: string;
  conflictStrategy?: ConflictStrategy | undefined;
  fileConflictStrategy?: ConflictStrategy | undefined;
  folderConflictStrategy?: ConflictStrategy | undefined;
  skipThumbnails?: boolean | undefined;
}): string[] {
  const args = ["filesystem", "upload"];
  pushOptional(args, "-c", input.conflictStrategy);
  pushOptional(args, "-f", input.fileConflictStrategy);
  pushOptional(args, "-d", input.folderConflictStrategy);
  if (input.skipThumbnails) args.push("-t");
  args.push(...input.localPaths, input.parentPath);
  return args;
}

function buildDownloadArgs(input: {
  paths: string[];
  localFolder: string;
  conflictStrategy?: ConflictStrategy | undefined;
  fileConflictStrategy?: ConflictStrategy | undefined;
  folderConflictStrategy?: ConflictStrategy | undefined;
}): string[] {
  const args = ["filesystem", "download"];
  pushOptional(args, "-c", input.conflictStrategy);
  pushOptional(args, "-f", input.fileConflictStrategy);
  pushOptional(args, "-d", input.folderConflictStrategy);
  args.push(...input.paths, input.localFolder);
  return args;
}

function pushOptional(args: string[], flag: string, value: string | undefined): void {
  if (value) args.push(flag, value);
}

function authStatusCacheMsFromEnv(): number {
  const parsed = Number(process.env.PROTON_DRIVE_AUTH_STATUS_CACHE_MS ?? "60000");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60_000;
}

function versionCacheMsFromEnv(): number {
  const parsed = Number(process.env.PROTON_DRIVE_VERSION_CACHE_MS ?? "300000");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300_000;
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

function pathListIncludes(pathList: string, entry: string): boolean {
  const normalizedEntry = normalizePathEntry(entry);
  return pathList
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .some((candidate) => normalizePathEntry(candidate) === normalizedEntry);
}

function normalizePathEntry(entry: string): string {
  const resolved = path.resolve(entry.replace(/^"|"$/g, ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.includes(0)) return true;
  const sampleSize = Math.min(buffer.byteLength, 4096);
  let suspicious = 0;
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i] ?? 0;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious++;
  }
  return sampleSize > 0 && suspicious / sampleSize > 0.05;
}

function splitRemoteFilePath(remotePath: string): { parentPath: string; name: string } {
  const trimmed = remotePath.replace(/\/+$/g, "");
  const index = trimmed.lastIndexOf("/");
  if (index <= 0 || index === trimmed.length - 1) {
    throw new Error("Remote file path must include a parent folder and file name.");
  }
  return {
    parentPath: trimmed.slice(0, index),
    name: trimmed.slice(index + 1),
  };
}
