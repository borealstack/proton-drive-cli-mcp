import { describe, expect, test } from "bun:test";
import { BackgroundCommandManager } from "../src/background.js";
import { ProtonDriveCli } from "../src/cli.js";
import { formatCommandFailure, redactArgs } from "../src/errors.js";
import { extractUrls, parseJsonOutput } from "../src/format.js";
import type { CliRunner, CommandResult, RunOptions } from "../src/types.js";

class FakeRunner implements CliRunner {
  readonly calls: Array<{ command: string; args: string[]; options: RunOptions | undefined }> = [];
  private readonly results: CommandResult[];

  constructor(results: Array<Partial<CommandResult> & { stdout?: string }> = [{}]) {
    this.results = results.map((result) => ({
      command: process.execPath,
      args: [],
      exitCode: 0,
      stdout: "[]",
      stderr: "",
      durationMs: 1,
      timedOut: false,
      ...result,
    }));
  }

  async run(command: string, args: string[], options?: RunOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const next = this.results.shift() ?? this.results.at(-1);
    if (!next) throw new Error("No fake command result configured.");
    return { ...next, command, args };
  }
}

describe("ProtonDriveCli", () => {
  test("adds the CLI JSON flag after the command name", async () => {
    const runner = new FakeRunner([{ stdout: "[]" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await cli.list("/my-files", "folder");

    expect(runner.calls[0]?.args).toEqual(["filesystem", "list", "-j", "-t", "folder", "/my-files"]);
  });

  test("builds upload arguments with conflict and thumbnail options", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await cli.upload({
      localPaths: ["a.txt", "b.txt"],
      parentPath: "/my-files/Reports",
      conflictStrategy: "skip",
      skipThumbnails: true,
      timeoutMs: 10_000,
    });

    expect(runner.calls[0]?.args).toEqual([
      "filesystem",
      "upload",
      "-j",
      "-c",
      "skip",
      "-t",
      "a.txt",
      "b.txt",
      "/my-files/Reports",
    ]);
    expect(runner.calls[0]?.options?.timeoutMs).toBe(10_000);
  });

  test("builds sharing invite arguments with repeated users", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await cli.sharingInvite({
      path: "/my-files/Reports",
      users: ["a@example.com", "b@example.com"],
      role: "editor",
      message: "Please review",
      includeNodeName: true,
    });

    expect(runner.calls[0]?.args).toEqual([
      "sharing",
      "invite",
      "-j",
      "-u",
      "a@example.com",
      "-u",
      "b@example.com",
      "-r",
      "editor",
      "-m",
      "Please review",
      "-n",
      "/my-files/Reports",
    ]);
  });

  test("builds sharing remove arguments only for an explicit target", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }, { stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await cli.sharingRemove({
      path: "/my-files/Reports",
      emails: ["a@example.com", "b@example.com"],
    });
    await cli.sharingRemove({
      path: "/my-files/Reports",
      all: true,
    });

    expect(runner.calls[0]?.args).toEqual([
      "sharing",
      "remove",
      "-j",
      "-e",
      "a@example.com",
      "-e",
      "b@example.com",
      "/my-files/Reports",
    ]);
    expect(runner.calls[1]?.args).toEqual(["sharing", "remove", "-j", "-a", "/my-files/Reports"]);
  });

  test("rejects ambiguous sharing remove input before calling the CLI", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    expect(() => cli.sharingRemove({ path: "/my-files/Reports" })).toThrow("requires either");
    expect(() =>
      cli.sharingRemove({
        path: "/my-files/Reports",
        emails: ["a@example.com"],
        all: true,
      }),
    ).toThrow("either emails or all=true");
    expect(runner.calls).toHaveLength(0);
  });

  test("builds public link arguments without accepting custom passwords", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await cli.sharingSetUrl({
      path: "/my-files/Reports",
      role: "editor",
      expiration: "2026-12-31",
    });

    expect(runner.calls[0]?.args).toEqual([
      "sharing",
      "set-url",
      "-j",
      "--role",
      "editor",
      "--expiration",
      "2026-12-31",
      "/my-files/Reports",
    ]);
  });

  test("redacts sensitive option values from command errors", async () => {
    const runner = new FakeRunner([{ exitCode: 1, stdout: "", stderr: "bad password" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    await expect(cli.run(["sharing", "set-url", "--password", "secret-value", "/my-files/Reports"])).rejects.toThrow(
      "--password [REDACTED]",
    );
  });

  test("reports authenticated when /my-files can be listed", async () => {
    const runner = new FakeRunner([{ stdout: "[]" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    const status = await cli.authStatus();

    expect(status.authenticated).toBe(true);
    expect(status.cached).toBe(false);
    expect(status.cliPath).toBe(process.execPath);
    expect(runner.calls[0]?.args).toEqual(["filesystem", "list", "-j", "/my-files"]);
  });

  test("caches successful auth status briefly", async () => {
    const runner = new FakeRunner([{ stdout: "[]" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner, authStatusCacheMs: 10_000 });

    const first = await cli.authStatus();
    const second = await cli.authStatus();

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(runner.calls).toHaveLength(1);
  });

  test("fresh auth status bypasses cache", async () => {
    const runner = new FakeRunner([{ stdout: "[]" }, { stdout: "[]" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner, authStatusCacheMs: 10_000 });

    await cli.authStatus();
    const fresh = await cli.authStatus({ fresh: true });

    expect(fresh.cached).toBe(false);
    expect(runner.calls).toHaveLength(2);
  });

  test("does not cache unauthenticated status", async () => {
    const runner = new FakeRunner([
      { exitCode: 1, stdout: "", stderr: "Authentication required" },
      { exitCode: 1, stdout: "", stderr: "Authentication required" },
    ]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner, authStatusCacheMs: 10_000 });

    await cli.authStatus();
    await cli.authStatus();

    expect(runner.calls).toHaveLength(2);
  });

  test("reports unauthenticated when list fails", async () => {
    const runner = new FakeRunner([
      {
        exitCode: 1,
        stdout: "",
        stderr: "Authentication required",
      },
    ]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    const status = await cli.authStatus();

    expect(status.authenticated).toBe(false);
    expect(status.detail).toContain("proton_drive_auth_login");
  });
});

describe("format helpers", () => {
  test("parses valid JSON output", () => {
    const parsed = parseJsonOutput({
      command: "proton-drive",
      args: ["filesystem", "list", "-j", "/my-files"],
      exitCode: 0,
      stdout: "[{\"name\":\"example\"}]",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });

    expect(parsed.json).toEqual([{ name: "example" }]);
  });

  test("extracts unique login URLs", () => {
    expect(extractUrls("Open https://account.proton.me/a and https://account.proton.me/a")).toEqual([
      "https://account.proton.me/a",
    ]);
  });

  test("redacts separate and inline sensitive CLI arguments", () => {
    expect(redactArgs(["sharing", "set-url", "--password", "secret", "/my-files"])).toEqual([
      "sharing",
      "set-url",
      "--password",
      "[REDACTED]",
      "/my-files",
    ]);
    expect(redactArgs(["sharing", "set-url", "--password=secret", "/my-files"])).toEqual([
      "sharing",
      "set-url",
      "--password=[REDACTED]",
      "/my-files",
    ]);
  });

  test("formats command failures without sensitive argument values", () => {
    const message = formatCommandFailure({
      command: "proton-drive",
      args: ["sharing", "set-url", "--password", "secret", "/my-files"],
      exitCode: 1,
      stdout: "",
      stderr: "failed",
      durationMs: 1,
      timedOut: false,
    });

    expect(message).toContain("--password [REDACTED]");
    expect(message).not.toContain("secret");
  });
});

describe("BackgroundCommandManager", () => {
  test("returns while a background command is still running", async () => {
    const manager = new BackgroundCommandManager();
    const startedAt = Date.now();
    const snapshot = await manager.start(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], {
      captureMs: 25,
      maxSessionMs: 5_000,
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(snapshot.state).toBe("running");
    expect(snapshot.pid).toBeNumber();

    const cancelled = manager.cancel();
    expect(cancelled?.state).toBe("failed");
  });
});
