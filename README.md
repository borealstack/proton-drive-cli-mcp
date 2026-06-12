<!-- mcp-name: io.github.borealstack/proton-drive-cli-mcp -->

<p align="center">
  <img src="assets/brand/proton-drive-cli-mcp-banner.png" alt="Proton Drive CLI MCP" width="100%">
</p>

<h1 align="center">Proton Drive CLI MCP</h1>

<p align="center">
  Manage Proton Drive from Claude, Codex, VS Code/Copilot, and any MCP client through Proton's official CLI.
  Authentication and encrypted Drive behavior stay with Proton's tooling.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@borealstack/proton-drive-cli-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/%40borealstack%2Fproton-drive-cli-mcp.svg"></a>
  <a href="https://www.npmjs.com/package/@borealstack/proton-drive-cli-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dw/%40borealstack%2Fproton-drive-cli-mcp.svg"></a>
  <a href="server.json"><img alt="MCP stdio" src="https://img.shields.io/badge/MCP-stdio-4f46e5.svg"></a>
  <a href="mcpb/manifest.json"><img alt="Claude MCPB" src="https://img.shields.io/badge/Claude-MCPB-2563eb.svg"></a>
  <a href="plugins/proton-drive-cli-mcp"><img alt="Codex plugin" src="https://img.shields.io/badge/Codex-plugin-059669.svg"></a>
  <a href="package.json"><img alt="Node.js 22+" src="https://img.shields.io/badge/node-%3E%3D22-16a34a.svg"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/borealstack/proton-drive-cli-mcp"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/borealstack/proton-drive-cli-mcp/badge"></a>
</p>

<p align="center">
  <a href="#install">Install</a>
  | <a href="#first-run">First Run</a>
  | <a href="#what-agents-can-do">Tools</a>
  | <a href="#safety-model">Safety</a>
  | <a href="docs/TOOLS.md">Tool Reference</a>
  | <a href="https://github.com/borealstack/proton-drive-cli-mcp/releases/latest">Latest Release</a>
</p>

---

## Why This Exists

AI agents can already run shell commands, but Drive operations should not depend
on prompt-crafted command lines. This server exposes Proton Drive as typed MCP
tools while delegating the sensitive parts to Proton's official `proton-drive`
CLI.

| What you get | How it works |
| --- | --- |
| Proton-supported Drive behavior | Calls the official Proton Drive CLI instead of reimplementing auth or encrypted Drive APIs. |
| Structured MCP tools | Agents can list, upload, download, share, trash, and inspect Drive paths through schemas. |
| Safer mutation flow | Destructive or account-changing tools require `confirm: true`. |
| Low-friction setup | Runs from npm with `npx`, and can install the official CLI into a managed user-local directory with SHA-512 verification. |
| Lower normal token use | Folder lists and background job status responses are bounded by default; full files still use upload/download or text helpers. |

> [!NOTE]
> This project is an independent interoperability wrapper. It is not affiliated
> with Proton AG.

## Install

Add the server to an MCP client as a local stdio server:

```json
{
  "mcpServers": {
    "proton-drive": {
      "command": "npx",
      "args": ["-y", "@borealstack/proton-drive-cli-mcp"],
      "env": {}
    }
  }
}
```

The command is a stdio server. If you run it directly in a terminal, no prompt
or banner is expected; it waits for MCP JSON-RPC messages on stdin.

### Client Shortcuts

| Client | Setup |
| --- | --- |
| Claude Code | `claude mcp add --transport stdio proton-drive -- npx -y @borealstack/proton-drive-cli-mcp` |
| Claude Desktop | Use the JSON config above, or install the [MCPB bundle](https://github.com/borealstack/proton-drive-cli-mcp/releases/latest/download/proton-drive-cli-mcp.mcpb). |
| Codex | Use the plugin metadata in [plugins/proton-drive-cli-mcp](plugins/proton-drive-cli-mcp). |
| VS Code | `code --add-mcp "{\"name\":\"proton-drive\",\"command\":\"npx\",\"args\":[\"-y\",\"@borealstack/proton-drive-cli-mcp\"]}"` |
| npm | `npx -y @borealstack/proton-drive-cli-mcp` |

## First Run

Start with diagnosis. The server will report whether the official CLI is found,
whether the managed install path exists, which version is available, and whether
the CLI can access `/my-files`.

```text
Call proton_drive_diagnose
```

If the CLI is missing, run setup:

```text
Call proton_drive_setup with installIfMissing=true
```

If authentication is missing, start the browser login flow:

```text
Call proton_drive_auth_login
Finish Proton sign-in in the browser
Call proton_drive_diagnose again
```

> [!TIP]
> The server does not request or store Proton credentials. Login, session
> storage, and encrypted Drive behavior remain delegated to Proton's official
> CLI.

## Requirements

- Node.js 22+ for the published package.
- Bun 1.3+ for repository development and Bun test coverage.
- The official Proton Drive CLI, or network access to Proton's CLI download
  index for managed install.
- Browser access for the official Proton login flow.

The CLI is resolved in this order:

1. `PROTON_DRIVE_CLI_PATH`
2. The managed user-local install path
3. `proton-drive` or `proton-drive.exe` in the current directory or common download paths
4. `proton-drive` on `PATH`
5. Managed install from Proton's CLI download index

Useful environment switches:

| Variable | Effect |
| --- | --- |
| `PROTON_DRIVE_CLI_PATH` | Use an explicit Proton Drive CLI binary. |
| `PROTON_DRIVE_CLI_AUTO_INSTALL=0` | Disable managed CLI installation. |
| `PROTON_DRIVE_CLI_INSTALL_DIR` | Override the managed install directory. |
| `PROTON_DRIVE_CLI_MANAGE_PATH=0` | Skip managed PATH updates. |
| `PROTON_DRIVE_AUTH_STATUS_CACHE_MS` | Tune successful auth-status caching. |
| `PROTON_DRIVE_VERSION_CACHE_MS` | Tune CLI version caching. |

## What Agents Can Do

| Area | Tools |
| --- | --- |
| Setup and auth | `proton_drive_diagnose`, `proton_drive_setup`, `proton_drive_auth_status`, `proton_drive_auth_login`, `proton_drive_auth_login_status`, `proton_drive_auth_login_cancel`, `proton_drive_auth_logout` |
| CLI metadata | `proton_drive_cli_install`, `proton_drive_cli_version`, `proton_drive_cli_help` |
| Files | `proton_drive_list`, `proton_drive_info`, `proton_drive_create_folder`, `proton_drive_upload`, `proton_drive_download` |
| Long-running work | `proton_drive_list_async`, `proton_drive_upload_async`, `proton_drive_download_async`, `proton_drive_job_status`, `proton_drive_job_cancel` |
| Small text files | `proton_drive_read_text`, `proton_drive_write_text` |
| Mutations | `proton_drive_rename`, `proton_drive_copy`, `proton_drive_move`, `proton_drive_trash`, `proton_drive_restore`, `proton_drive_delete`, `proton_drive_empty_trash` |
| Sharing | `proton_drive_sharing_status`, `proton_drive_sharing_invite`, `proton_drive_sharing_remove`, `proton_drive_sharing_set_url`, `proton_drive_sharing_remove_url` |
| Invitations | `proton_drive_invitation_list`, `proton_drive_invitation_accept`, `proton_drive_invitation_reject` |

Full schemas and examples are in [docs/TOOLS.md](docs/TOOLS.md).

### Common Agent Workflows

```text
List the top 20 items in /my-files/Reports.
```

Uses `proton_drive_list` with bounded output and pagination metadata.

```text
Upload these local files to /my-files/Reports, then poll until done.
```

Uses `proton_drive_upload_async` followed by `proton_drive_job_status`.

```text
Read /my-files/Notes/todo.txt, update the text, and write it back.
```

Uses `proton_drive_read_text` and `proton_drive_write_text` for small UTF-8
files. Full binary or large-file work should use `proton_drive_download` and
`proton_drive_upload`.

## Safety Model

This project is designed so the MCP layer can orchestrate Drive work without
becoming a credential broker.

| Guardrail | Behavior |
| --- | --- |
| Credential handling | Proton login and session storage stay inside the official CLI. |
| Destructive actions | Delete, empty trash, logout, sharing removal, and invitation decisions require `confirm: true`. |
| Public-link passwords | Custom passwords are not exposed through MCP arguments because CLI arguments can be visible to local process inspection. |
| Output size | List tools are bounded; background JSON output is summarized with byte counts and truncation metadata. |
| Provenance | npm publishes with provenance; release assets include checksums and Sigstore-backed attestations. |

> [!IMPORTANT]
> `proton_drive_delete` and `proton_drive_empty_trash` are permanent operations.
> Prefer `proton_drive_trash` first unless the user explicitly asks to delete.

## Release Channels

| Channel | Artifact |
| --- | --- |
| npm | [@borealstack/proton-drive-cli-mcp](https://www.npmjs.com/package/@borealstack/proton-drive-cli-mcp) |
| GitHub release | [latest release assets](https://github.com/borealstack/proton-drive-cli-mcp/releases/latest) |
| MCP Registry manifest | [server.json](server.json) |
| Claude Desktop | [proton-drive-cli-mcp.mcpb](https://github.com/borealstack/proton-drive-cli-mcp/releases/latest/download/proton-drive-cli-mcp.mcpb) |
| Codex plugin | [plugins/proton-drive-cli-mcp](plugins/proton-drive-cli-mcp) |

Release assets include:

- npm package tarball
- MCPB bundle
- `SHA256SUMS`
- Sigstore JSON attestation bundle

## Develop Locally

```powershell
bun install
bun run typecheck
bun test
bun run build
npm test
```

Run the development server through Bun:

```json
{
  "mcpServers": {
    "proton-drive-dev": {
      "command": "bun",
      "args": ["run", "<path-to-repo>/src/index.ts"],
      "env": {}
    }
  }
}
```

Run real-account smoke checks only when you intentionally want to touch a
logged-in Proton Drive account. Keep generated smoke artifacts local and out of
git.

## Project Map

| Path | Purpose |
| --- | --- |
| [src/index.ts](src/index.ts) | stdio MCP server entry point |
| [src/server.ts](src/server.ts) | MCP tool registration surface |
| [src/cli.ts](src/cli.ts) | shared Proton Drive CLI behavior |
| [src/installer.ts](src/installer.ts) | managed official CLI download and checksum verification |
| [docs/TOOLS.md](docs/TOOLS.md) | tool inputs, outputs, and examples |
| [server.json](server.json) | MCP Registry metadata |
| [mcpb/manifest.json](mcpb/manifest.json) | Claude MCPB metadata |
| [plugins/proton-drive-cli-mcp](plugins/proton-drive-cli-mcp) | Codex plugin package |

## References

- [Proton: Using Proton Drive CLI](https://proton.me/support/drive-cli)
- [Proton blog: Introducing Proton Drive CLI](https://proton.me/blog/proton-drive-cli)
- [Official Proton Drive CLI README](https://github.com/ProtonDriveApps/sdk/blob/main/js/cli/README.md)
- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Help Discovery

If this project helps you connect Proton Drive to an MCP client, star the
repository so other users can find the maintained official-CLI wrapper:
[borealstack/proton-drive-cli-mcp](https://github.com/borealstack/proton-drive-cli-mcp).
