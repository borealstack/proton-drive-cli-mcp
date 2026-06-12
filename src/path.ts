import { access } from "node:fs/promises";
import path from "node:path";
import type { CliRunner } from "./types.js";
import { installProtonDriveCli, managedCliPath } from "./installer.js";

export interface ResolveCliPathOptions {
  autoInstall?: boolean | undefined;
  fallbackToCommand?: boolean | undefined;
}

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function candidateFiles(): string[] {
  const candidates = new Set<string>();
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const cwd = process.cwd();

  candidates.add(managedCliPath());

  for (const base of [cwd, home ? path.join(home, "Downloads") : ""]) {
    if (!base) continue;
    candidates.add(path.join(base, "proton-drive"));
    candidates.add(path.join(base, "proton-drive.exe"));
  }

  if (localAppData) {
    candidates.add(path.join(localAppData, "Programs", "Proton", "Drive", "proton-drive.exe"));
  }

  for (const unixPath of ["/usr/local/bin/proton-drive", "/usr/bin/proton-drive", "/opt/proton-drive/proton-drive"]) {
    candidates.add(unixPath);
  }

  return [...candidates];
}

export async function resolveCliPath(explicitPath?: string, runner?: CliRunner, options: ResolveCliPathOptions = {}): Promise<string> {
  if (explicitPath) {
    if (await isExecutableFile(explicitPath)) {
      return explicitPath;
    }
    throw new Error(`PROTON_DRIVE_CLI_PATH does not exist or is not readable: ${explicitPath}`);
  }

  const envPath = process.env.PROTON_DRIVE_CLI_PATH;
  if (envPath) {
    if (await isExecutableFile(envPath)) {
      return envPath;
    }
    throw new Error(`PROTON_DRIVE_CLI_PATH does not exist or is not readable: ${envPath}`);
  }

  for (const candidate of candidateFiles()) {
    if (await isExecutableFile(candidate)) {
      return candidate;
    }
  }

  if (runner) {
    for (const command of ["proton-drive", "proton-drive.exe"]) {
      try {
        const result = await runner.run(command, ["version"], { timeoutMs: 5_000 });
        if (result.exitCode === 0) return command;
      } catch {
        // Try the next command name.
      }
    }
  }

  const autoInstall = options.autoInstall ?? process.env.PROTON_DRIVE_CLI_AUTO_INSTALL !== "0";
  if (autoInstall) {
    const installed = await installProtonDriveCli({
      installDir: process.env.PROTON_DRIVE_CLI_INSTALL_DIR,
      indexUrl: process.env.PROTON_DRIVE_CLI_DOWNLOAD_INDEX,
    });
    return installed.path;
  }

  if (options.fallbackToCommand === false) {
    throw new Error("Proton Drive CLI was not found. Run proton_drive_cli_install or set PROTON_DRIVE_CLI_PATH.");
  }

  return "proton-drive";
}
