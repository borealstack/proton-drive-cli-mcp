import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectAssetPlatform, installProtonDriveCli, parseCliReleaseIndex } from "../src/installer.js";

const TEST_CLI_VERSION = "test-version";
const sampleIndex = String.raw`
<!DOCTYPE html>
<html>
  <head><title>Proton Drive CLI ${TEST_CLI_VERSION}</title></head>
  <body>
    <h1>Proton Drive CLI ${TEST_CLI_VERSION}</h1>
    <table>
      <tr><th>Platform</th><th>URL</th><th>Checksum (SHA-512)</th></tr>
      <tr>
        <td>windows/x64</td>
        <td><a href="https://proton.me/download/drive/cli/${TEST_CLI_VERSION}/windows-x64/proton-drive.exe">download</a></td>
        <td><code>d2091da65bab0a9d36220ca0c80e6d2ab8a82ae2649fd8e65693de6c3ec21aa0063fbd390436eec9a762793764263210ab5c5de71bbb0b35fdff5e2fd9a842d6</code></td>
      </tr>
      <tr>
        <td>linux/arm64</td>
        <td><a href="https://proton.me/download/drive/cli/${TEST_CLI_VERSION}/linux-arm64/proton-drive">download</a></td>
        <td><code>0d7d5ee692f645b4dd92aa27e13eab4e9eefb9dda3e80ee9cba2a4ad75c141be898bee3b4503167b6cf17cf8ba08be4adb862be46ff670b60514359712596c30</code></td>
      </tr>
    </table>
  </body>
</html>`;

describe("installer", () => {
  test("parses Proton Drive CLI release index assets", () => {
    const parsed = parseCliReleaseIndex(sampleIndex);

    expect(parsed.version).toBe(TEST_CLI_VERSION);
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.assets[0]).toEqual({
      platform: "windows/x64",
      url: `https://proton.me/download/drive/cli/${TEST_CLI_VERSION}/windows-x64/proton-drive.exe`,
      sha512: "d2091da65bab0a9d36220ca0c80e6d2ab8a82ae2649fd8e65693de6c3ec21aa0063fbd390436eec9a762793764263210ab5c5de71bbb0b35fdff5e2fd9a842d6",
    });
  });

  test("detects current supported platform labels", () => {
    expect(detectAssetPlatform("win32", "x64")).toBe("windows/x64");
    expect(detectAssetPlatform("darwin", "arm64")).toBe("macos/arm64");
    expect(detectAssetPlatform("linux", "x64")).toBe("linux/x64");
  });

  test("installs the managed CLI binary and reports PATH status", async () => {
    const binary = Buffer.from("fake proton-drive binary");
    const checksum = createHash("sha512").update(binary).digest("hex");
    const assetUrl = `data:application/octet-stream;base64,${binary.toString("base64")}`;
    const index = String.raw`
      <html>
        <head><title>Proton Drive CLI ${TEST_CLI_VERSION}</title></head>
        <body>
          <h1>Proton Drive CLI ${TEST_CLI_VERSION}</h1>
          <table>
            <tr><th>Platform</th><th>URL</th><th>Checksum (SHA-512)</th></tr>
            <tr>
              <td>linux/x64</td>
              <td><a href="${assetUrl}">download</a></td>
              <td><code>${checksum}</code></td>
            </tr>
          </table>
        </body>
      </html>`;
    const installDir = await mkdtemp(path.join(tmpdir(), "proton-drive-cli-test-"));

    try {
      const result = await installProtonDriveCli({
        installDir,
        indexUrl: `data:text/html;base64,${Buffer.from(index).toString("base64")}`,
        platform: "linux",
        arch: "x64",
        managePath: false,
      });

      expect(result.path).toBe(path.join(installDir, "proton-drive"));
      expect(await readFile(result.path, "utf8")).toBe(binary.toString("utf8"));
      expect(result.pathStatus.command).toBe("proton-drive");
      expect(result.pathStatus.directory).toBe(path.resolve(installDir));
      expect(result.pathStatus.userPathUpdated).toBe(false);
    } finally {
      await rm(installDir, { force: true, recursive: true });
    }
  });
});
