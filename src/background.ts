import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { extractUrls } from "./format.js";
import type { BackgroundCommandSnapshot, BackgroundCommandState, BackgroundJobKind } from "./types.js";

const MAX_BUFFER_CHARS = 40_000;

export class BackgroundCommand {
  private readonly startedAt = Date.now();
  private readonly child: ChildProcessByStdio<null, Readable, Readable>;
  private readonly lifetimeTimer: NodeJS.Timeout;
  private stdout = "";
  private stderr = "";
  private state: BackgroundCommandState = "running";
  private exitCode: number | null | undefined;
  private signal: NodeJS.Signals | null | undefined;
  private timedOut = false;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    maxSessionMs: number,
    private readonly metadata: { jobId?: string | undefined; kind?: BackgroundJobKind | undefined; label?: string | undefined } = {},
  ) {
    this.child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.stdout = appendWithCap(this.stdout, chunk);
    });
    this.child.stderr.on("data", (chunk) => {
      this.stderr = appendWithCap(this.stderr, chunk);
    });

    this.child.on("error", (error) => {
      this.stderr = appendWithCap(this.stderr, error.message);
      this.state = "failed";
    });

    this.child.on("close", (exitCode, signal) => {
      clearTimeout(this.lifetimeTimer);
      this.exitCode = exitCode;
      this.signal = signal;
      if (this.timedOut) {
        this.state = "timed_out";
      } else {
        this.state = exitCode === 0 ? "completed" : "failed";
      }
    });

    this.lifetimeTimer = setTimeout(() => {
      this.timedOut = true;
      this.state = "timed_out";
      this.child.kill();
    }, maxSessionMs);
  }

  get running(): boolean {
    return this.state === "running";
  }

  async snapshotAfter(captureMs: number): Promise<BackgroundCommandSnapshot> {
    if (this.running && captureMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, captureMs));
    }
    return this.snapshot();
  }

  snapshot(): BackgroundCommandSnapshot {
    const combined = `${this.stdout}\n${this.stderr}`;
    return {
      jobId: this.metadata.jobId,
      kind: this.metadata.kind,
      label: this.metadata.label,
      command: this.command,
      args: this.args,
      pid: this.child.pid,
      state: this.state,
      stdout: this.stdout,
      stderr: this.stderr,
      exitCode: this.exitCode,
      signal: this.signal,
      durationMs: Date.now() - this.startedAt,
      timedOut: this.timedOut,
      loginUrls: extractUrls(combined),
    };
  }

  cancel(): BackgroundCommandSnapshot {
    if (this.running) {
      this.child.kill();
      this.state = "failed";
    }
    clearTimeout(this.lifetimeTimer);
    return this.snapshot();
  }
}

export class BackgroundCommandManager {
  private activeCommand: BackgroundCommand | undefined;

  start(command: string, args: string[], options: { captureMs: number; maxSessionMs: number }): Promise<BackgroundCommandSnapshot> {
    if (this.activeCommand?.running) {
      return this.activeCommand.snapshotAfter(Math.min(options.captureMs, 1_000));
    }

    this.activeCommand = new BackgroundCommand(command, args, options.maxSessionMs, { kind: "auth_login" });
    return this.activeCommand.snapshotAfter(options.captureMs);
  }

  snapshot(): BackgroundCommandSnapshot | undefined {
    return this.activeCommand?.snapshot();
  }

  cancel(): BackgroundCommandSnapshot | undefined {
    const snapshot = this.activeCommand?.cancel();
    this.activeCommand = undefined;
    return snapshot;
  }
}

export class BackgroundJobManager {
  private readonly jobs = new Map<string, BackgroundCommand>();

  start(
    kind: BackgroundJobKind,
    command: string,
    args: string[],
    options: { captureMs: number; maxSessionMs: number; label?: string | undefined },
  ): Promise<BackgroundCommandSnapshot> {
    this.pruneCompletedJobs();
    const jobId = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const job = new BackgroundCommand(command, args, options.maxSessionMs, { jobId, kind, label: options.label });
    this.jobs.set(jobId, job);
    return job.snapshotAfter(options.captureMs);
  }

  snapshot(jobId: string): BackgroundCommandSnapshot | undefined {
    return this.jobs.get(jobId)?.snapshot();
  }

  snapshots(): BackgroundCommandSnapshot[] {
    this.pruneCompletedJobs();
    return [...this.jobs.values()].map((job) => job.snapshot());
  }

  cancel(jobId: string): BackgroundCommandSnapshot | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const snapshot = job.cancel();
    this.jobs.delete(jobId);
    return snapshot;
  }

  private pruneCompletedJobs(): void {
    const snapshots = [...this.jobs.entries()].map(([jobId, job]) => [jobId, job.snapshot()] as const);
    const completed = snapshots.filter(([, snapshot]) => snapshot.state !== "running");
    const maxCompleted = 25;
    for (const [jobId] of completed.slice(0, Math.max(0, completed.length - maxCompleted))) {
      this.jobs.delete(jobId);
    }
  }
}

function appendWithCap(existing: string, chunk: string): string {
  const next = existing + chunk;
  return next.length <= MAX_BUFFER_CHARS ? next : next.slice(next.length - MAX_BUFFER_CHARS);
}
