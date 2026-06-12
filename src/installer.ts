import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const PROTON_DRIVE_CLI_INDEX_URL = "https://proton.me/download/drive/cli/index.html";
const execFileAsync = promisify(execFile);

export interface CliReleaseAsset {
  platform: string;
  url: string;
  sha512: string;
}

export interface CliReleaseIndex {
  version: string;
  assets: CliReleaseAsset[];
}

export interface InstallCliOptions {
  force?: boolean | undefined;
  installDir?: string | undefined;
  indexUrl?: string | undefined;
  platform?: NodeJS.Platform | undefined;
  arch?: NodeJS.Architecture | undefined;
  managePath?: boolean | undefined;
}

export interface InstallPathStatus {
  command: "proton-drive";
  directory: string;
  alreadyOnPath: boolean;
  currentProcessUpdated: boolean;
  userPathUpdated: boolean;
  needsShellRestart: boolean;
  error?: string | undefined;
  message: string;
}

export interface InstallCliResult {
  path: string;
  version: string;
  platform: string;
  url: string;
  checksum: string;
  checksumVerified: boolean;
  installed: boolean;
  pathStatus: InstallPathStatus;
}

export function managedCliPath(platform: NodeJS.Platform = process.platform): string {
  const home = os.homedir();
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, "Programs", "proton-drive-cli", "proton-drive.exe");
  }

  return path.join(home, ".local", "bin", "proton-drive");
}

export function defaultInstallDir(platform: NodeJS.Platform = process.platform): string {
  return path.dirname(managedCliPath(platform));
}

export function detectAssetPlatform(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): string {
  const archLabel = arch === "x64" || arch === "arm64" ? arch : undefined;
  if (!archLabel) {
    throw new Error(`Unsupported CPU architecture for Proton Drive CLI: ${arch}`);
  }

  if (platform === "win32") return `windows/${archLabel}`;
  if (platform === "darwin") return `macos/${archLabel}`;
  if (platform === "linux") return `linux/${archLabel}`;
  throw new Error(`Unsupported operating system for Proton Drive CLI: ${platform}`);
}

export function parseCliReleaseIndex(html: string): CliReleaseIndex {
  const versionMatch =
    html.match(/<h1>\s*Proton Drive CLI\s+([^<\s]+)\s*<\/h1>/i) ??
    html.match(/<title>\s*Proton Drive CLI\s+([^<\s]+)\s*<\/title>/i);
  if (!versionMatch?.[1]) {
    throw new Error("Could not parse Proton Drive CLI version from release index.");
  }

  const assets: CliReleaseAsset[] = [];
  const rowRegex =
    /<tr>\s*<td>([^<]+)<\/td>\s*<td><a\s+href="([^"]+)">[\s\S]*?<\/a><\/td>\s*<td><code>([a-fA-F0-9]{128})<\/code><\/td>\s*<\/tr>/gi;
  for (const match of html.matchAll(rowRegex)) {
    const platform = match[1]?.trim();
    const url = match[2]?.trim();
    const sha512 = match[3]?.trim().toLowerCase();
    if (platform && url && sha512) assets.push({ platform, url, sha512 });
  }

  if (assets.length === 0) {
    throw new Error("Could not parse Proton Drive CLI platform assets from release index.");
  }

  return {
    version: versionMatch[1],
    assets,
  };
}

export async function fetchCliReleaseIndex(indexUrl = PROTON_DRIVE_CLI_INDEX_URL): Promise<CliReleaseIndex> {
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Proton Drive CLI release index: HTTP ${response.status}`);
  }
  return parseCliReleaseIndex(await response.text());
}

export async function installProtonDriveCli(options: InstallCliOptions = {}): Promise<InstallCliResult> {
  const platformKey = detectAssetPlatform(options.platform, options.arch);
  const release = await fetchCliReleaseIndex(options.indexUrl);
  const asset = release.assets.find((candidate) => candidate.platform === platformKey);
  if (!asset) {
    throw new Error(`No Proton Drive CLI binary is listed for ${platformKey}.`);
  }

  const installDir = options.installDir ?? defaultInstallDir(options.platform);
  const filename = platformKey.startsWith("windows/") ? "proton-drive.exe" : "proton-drive";
  const targetPath = path.join(installDir, filename);

  if (!options.force && (await pathExists(targetPath))) {
    const pathStatus = await ensureCliDirectoryOnPath(installDir, options);
    return {
      path: targetPath,
      version: release.version,
      platform: platformKey,
      url: asset.url,
      checksum: asset.sha512,
      checksumVerified: false,
      installed: false,
      pathStatus,
    };
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to download Proton Drive CLI: HTTP ${response.status}`);
  }

  const binary = Buffer.from(await response.arrayBuffer());
  const actualSha512 = createHash("sha512").update(binary).digest("hex");
  if (actualSha512 !== asset.sha512) {
    throw new Error(
      `Downloaded Proton Drive CLI checksum mismatch. Expected ${asset.sha512}, got ${actualSha512}.`,
    );
  }

  await mkdir(installDir, { recursive: true });
  const tempPath = path.join(installDir, `${filename}.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tempPath, binary);
  if (!platformKey.startsWith("windows/")) {
    await chmod(tempPath, 0o755);
  }
  await rm(targetPath, { force: true });
  await rename(tempPath, targetPath);
  const pathStatus = await ensureCliDirectoryOnPath(installDir, options);

  return {
    path: targetPath,
    version: release.version,
    platform: platformKey,
    url: asset.url,
    checksum: asset.sha512,
    checksumVerified: true,
    installed: true,
    pathStatus,
  };
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function ensureCliDirectoryOnPath(installDir: string, options: InstallCliOptions): Promise<InstallPathStatus> {
  const managePath = options.managePath ?? process.env.PROTON_DRIVE_CLI_MANAGE_PATH !== "0";
  const platform = options.platform ?? process.platform;
  const directory = path.resolve(installDir);
  const alreadyOnPath = pathListIncludes(process.env.PATH ?? "", directory, platform);
  let currentProcessUpdated = false;
  let userPathUpdated = false;
  let needsShellRestart = false;
  let message: string;

  if (!managePath) {
    return {
      command: "proton-drive",
      directory,
      alreadyOnPath,
      currentProcessUpdated,
      userPathUpdated,
      needsShellRestart,
      message: pathMessage(platform, directory, alreadyOnPath, userPathUpdated, currentProcessUpdated, false),
    };
  }

  if (!alreadyOnPath) {
    process.env.PATH = appendPathEntry(process.env.PATH ?? "", directory, platform);
    currentProcessUpdated = true;
  }

  let pathError: string | undefined;
  if (platform === "win32") {
    try {
      const userPath = await readWindowsUserPath();
      if (!pathListIncludes(userPath, directory, platform)) {
        await writeWindowsUserPath(appendPathEntry(userPath, directory, platform));
        userPathUpdated = true;
        needsShellRestart = true;
      }
    } catch (error) {
      pathError = error instanceof Error ? error.message : String(error);
    }
  }

  message = pathMessage(platform, directory, alreadyOnPath, userPathUpdated, currentProcessUpdated, true, pathError);
  return {
    command: "proton-drive",
    directory,
    alreadyOnPath,
    currentProcessUpdated,
    userPathUpdated,
    needsShellRestart,
    error: pathError,
    message,
  };
}

function pathMessage(
  platform: NodeJS.Platform,
  directory: string,
  alreadyOnPath: boolean,
  userPathUpdated: boolean,
  currentProcessUpdated: boolean,
  managePath: boolean,
  error?: string | undefined,
): string {
  if (!managePath) {
    return `PATH management is disabled. Use the full path or add ${directory} to PATH to run proton-drive directly.`;
  }
  if (error) {
    return `Installed the Proton Drive CLI, but could not update PATH automatically. Add ${directory} to PATH to run proton-drive directly.`;
  }
  if (alreadyOnPath) {
    return "The Proton Drive CLI install directory is already on PATH; run proton-drive from a terminal.";
  }
  if (platform === "win32" && userPathUpdated) {
    return "Added the Proton Drive CLI install directory to the Windows user PATH. Open a new terminal, then run proton-drive.";
  }
  if (currentProcessUpdated) {
    return `Added ${directory} to this server process PATH. Add it to your shell PATH to run proton-drive directly from a separate terminal.`;
  }
  return `Use the full path or add ${directory} to PATH to run proton-drive directly.`;
}

function appendPathEntry(currentPath: string, entry: string, platform: NodeJS.Platform): string {
  return currentPath ? `${currentPath}${pathDelimiter(platform)}${entry}` : entry;
}

function pathListIncludes(pathList: string, entry: string, platform: NodeJS.Platform): boolean {
  const normalizedEntry = normalizePathEntry(entry, platform);
  return pathList
    .split(pathDelimiter(platform))
    .filter(Boolean)
    .some((candidate) => normalizePathEntry(candidate, platform) === normalizedEntry);
}

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

function normalizePathEntry(entry: string, platform: NodeJS.Platform): string {
  const resolved = path.resolve(entry.replace(/^"|"$/g, ""));
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function readWindowsUserPath(): Promise<string> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "[Environment]::GetEnvironmentVariable('Path', 'User')",
  ]);
  return stdout.trim();
}

async function writeWindowsUserPath(userPath: string): Promise<void> {
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Environment]::SetEnvironmentVariable('Path', $env:PROTON_DRIVE_NEW_USER_PATH, 'User')",
    ],
    {
      env: {
        ...process.env,
        PROTON_DRIVE_NEW_USER_PATH: userPath,
      },
    },
  );
}
