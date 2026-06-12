# Proton Drive CLI MCP Plugin

This Codex plugin starts a local MCP server for managing Proton Drive through
Proton's official CLI without exposing Proton credentials.

## What It Provides

- MCP tools for Proton Drive setup diagnosis, browser login, bounded listing, background transfers, text-file helpers, sharing, trash, and invitations.
- A safe default auth flow that delegates login to the official Proton Drive CLI.
- No Proton password or token storage in the MCP server or plugin.

## Server Configuration

- The MCP server is launched through the public package binary with `npx -y @borealstack/proton-drive-cli-mcp`.
- Proton Drive CLI: auto-detected or auto-installed from Proton's official CLI download index.

The official CLI command name is `proton-drive`. The CLI path usually should not be hard-coded; set `PROTON_DRIVE_CLI_PATH` only when you need to pin a specific binary.

## First Use

1. Ask Codex to call `proton_drive_diagnose`.
2. If setup is incomplete, call `proton_drive_setup`.
3. If unauthenticated, call `proton_drive_auth_login`.
4. Finish the browser login flow. The tool returns quickly and does not wait for browser completion.
5. Call `proton_drive_diagnose` again.

Use `proton_drive_auth_login_status` to inspect the background login process, or `proton_drive_auth_login_cancel` with `confirm: true` to stop it.

## Safety

Permanent delete, empty trash, logout, sharing removal, and invitation accept/reject tools require `confirm: true`.

The MCP server uses the official CLI's `--json` output where available.

Custom public-link passwords are not exposed by the MCP tool surface because the current official CLI accepts them only as command-line arguments.

If the CLI is missing, the MCP server downloads the latest official binary for the current OS/CPU, verifies Proton's SHA-512 checksum, and installs it to a user-local managed path. On Windows, the managed install directory is added to the user PATH when possible so new terminals can run `proton-drive`. Set `PROTON_DRIVE_CLI_AUTO_INSTALL=0` to disable this, or `PROTON_DRIVE_CLI_MANAGE_PATH=0` to skip PATH management.
