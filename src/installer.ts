import { createHash } from "node:crypto";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const PROTON_DRIVE_CLI_INDEX_URL = "https://proton.me/download/drive/cli/index.html";

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
}

export interface InstallCliResult {
  path: string;
  version: string;
  platform: string;
  url: string;
  checksum: string;
  checksumVerified: boolean;
  installed: boolean;
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
    return {
      path: targetPath,
      version: release.version,
      platform: platformKey,
      url: asset.url,
      checksum: asset.sha512,
      checksumVerified: false,
      installed: false,
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

  return {
    path: targetPath,
    version: release.version,
    platform: platformKey,
    url: asset.url,
    checksum: asset.sha512,
    checksumVerified: true,
    installed: true,
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
