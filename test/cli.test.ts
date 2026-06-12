import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { BackgroundCommandManager } from "../src/background.js";
import { ProtonDriveCli } from "../src/cli.js";
import { formatCommandFailure, redactArgs } from "../src/errors.js";
import { extractUrls, formatBackgroundSnapshot, parseJsonOutput } from "../src/format.js";
import type { CliRunner, CommandResult, RunOptions } from "../src/types.js";

class FakeRunner implements CliRunner {
  readonly calls: Array<{ command: string; args: string[]; options: RunOptions | undefined }> = [];
  private readonly results: CommandResult[];
  private readonly onRun: ((command: string, args: string[], options: RunOptions | undefined, callIndex: number) => Promise<Partial<CommandResult> | void> | Partial<CommandResult> | void) | undefined;

  constructor(
    results: Array<Partial<CommandResult> & { stdout?: string }> = [{}],
    onRun?: (command: string, args: string[], options: RunOptions | undefined, callIndex: number) => Promise<Partial<CommandResult> | void> | Partial<CommandResult> | void,
  ) {
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
    this.onRun = onRun;
  }

  async run(command: string, args: string[], options?: RunOptions): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const override = await this.onRun?.(command, args, options, this.calls.length - 1);
    const next = this.results.shift() ?? this.results.at(-1);
    if (!next) throw new Error("No fake command result configured.");
    return { ...next, ...override, command, args };
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

  test("diagnoses ready setup with version and auth checks", async () => {
    const runner = new FakeRunner([{ stdout: "Proton Drive CLI test\n" }, { stdout: "[]" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner, authStatusCacheMs: 10_000 });

    const diagnosis = await cli.diagnose({ fresh: true });

    expect(diagnosis.ready).toBe(true);
    expect(diagnosis.cli.found).toBe(true);
    expect(diagnosis.cli.version).toContain("Proton Drive CLI");
    expect(diagnosis.auth.authenticated).toBe(true);
    expect(diagnosis.nextAction).toContain("Ready");
  });

  test("caches successful version checks", async () => {
    const runner = new FakeRunner([{ stdout: "version-one" }, { stdout: "version-two" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner, versionCacheMs: 10_000 });

    const first = await cli.version();
    const second = await cli.version();

    expect(first.stdout).toBe("version-one");
    expect(second.stdout).toBe("version-one");
    expect(runner.calls).toHaveLength(1);
  });

  test("starts and reports background list jobs", async () => {
    const cli = new ProtonDriveCli({ cliPath: process.execPath });

    const snapshot = await cli.startListJob({
      path: "/my-files",
      captureMs: 10,
      maxSessionMs: 30_000,
    });

    expect(snapshot.jobId).toStartWith("list-");
    expect(snapshot.kind).toBe("list");
    expect(cli.jobSnapshot(snapshot.jobId ?? "")?.jobId).toBe(snapshot.jobId);
    cli.cancelJob(snapshot.jobId ?? "");
  });

  test("reads a small downloaded text file and rejects binary content", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }, { stdout: "{\"ok\":true}" }], async (_command, args) => {
      const localFolder = args.at(-1);
      if (typeof localFolder === "string") {
        await writeFile(join(localFolder, "note.txt"), args.includes("/my-files/binary.bin") ? Buffer.from([0, 1, 2]) : "hello");
      }
    });
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    const text = await cli.readText({ path: "/my-files/note.txt" });

    expect(text.text).toBe("hello");
    await expect(cli.readText({ path: "/my-files/binary.bin" })).rejects.toThrow("binary");
  });

  test("writes text through a temporary upload file", async () => {
    const runner = new FakeRunner([{ stdout: "{\"ok\":true}" }]);
    const cli = new ProtonDriveCli({ cliPath: process.execPath, runner });

    const result = await cli.writeText({
      path: "/my-files/Notes/hello.txt",
      text: "hello world",
      conflictStrategy: "replace",
    });

    expect(result.parentPath).toBe("/my-files/Notes");
    expect(result.name).toBe("hello.txt");
    expect(result.bytes).toBe(11);
    expect(runner.calls[0]?.args[0]).toBe("filesystem");
    expect(runner.calls[0]?.args[1]).toBe("upload");
    expect(runner.calls[0]?.args).toContain("replace");
    expect(basename(runner.calls[0]?.args.at(-2) ?? "")).toBe("hello.txt");
    expect(runner.calls[0]?.args.at(-1)).toBe("/my-files/Notes");
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

  test("formats background JSON output with bounded previews", () => {
    const json = Array.from({ length: 75 }, (_, index) => ({
      name: `file-${index}`,
      detail: "x".repeat(100),
    }));
    const formatted = formatBackgroundSnapshot({
      jobId: "list-test",
      kind: "list",
      command: "proton-drive",
      args: ["filesystem", "list", "-j", "/my-files"],
      pid: 123,
      state: "completed",
      stdout: JSON.stringify(json),
      stderr: "",
      exitCode: 0,
      signal: null,
      durationMs: 10,
      timedOut: false,
      loginUrls: [],
    });

    expect(formatted.output.stdoutTruncated).toBe(true);
    expect(formatted.output.stdoutSuppressedBecauseJsonParsed).toBe(true);
    expect(formatted.json).toEqual({
      items: json.slice(0, 50).map((item) => ({ name: item.name })),
      totalItems: 75,
      returnedItems: 50,
      limit: 50,
      truncated: true,
    });
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
