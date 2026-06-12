import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

test("built server exposes tools over stdio under Node.js", async () => {
  const client = new StdioClient("node", ["dist/index.js"]);
  try {
    await client.start();
    const response = await client.request("tools/list", {});
    assert.ok(Array.isArray(response.result?.tools));
    assert.ok(response.result.tools.some((tool) => tool.name === "proton_drive_auth_status"));
    assert.ok(response.result.tools.some((tool) => tool.name === "proton_drive_diagnose"));
    assert.ok(response.result.tools.some((tool) => tool.name === "proton_drive_upload_async"));
    assert.ok(response.result.tools.some((tool) => tool.name === "proton_drive_read_text"));
  } finally {
    client.close();
  }
});

class StdioClient {
  constructor(command, args) {
    this.command = command;
    this.args = args;
    this.nextId = 1;
    this.stdout = "";
    this.stderr = "";
    this.pending = new Map();
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("exit", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`MCP server exited unexpectedly. stderr=${this.stderr}`));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "node-stdio-test", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}. stderr=${this.stderr}`));
      }, 10_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          if (value.error) {
            reject(new Error(`MCP error for ${method}: ${JSON.stringify(value.error)}`));
            return;
          }
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  close() {
    if (!this.child || this.child.killed) return;
    this.child.kill();
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onStdout(chunk) {
    this.stdout += chunk;
    for (;;) {
      const newline = this.stdout.indexOf("\n");
      if (newline === -1) return;
      const line = this.stdout.slice(0, newline).trim();
      this.stdout = this.stdout.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      pending.resolve(message);
    }
  }
}
