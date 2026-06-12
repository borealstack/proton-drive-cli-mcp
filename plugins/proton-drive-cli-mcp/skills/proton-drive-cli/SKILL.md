---
name: proton-drive-cli
description: Use when the user wants to browse, upload, download, organize, share, or authenticate Proton Drive through the Proton Drive CLI MCP server and official Proton Drive CLI.
---

# Proton Drive

Use the `proton-drive-cli` MCP server tools for Proton Drive work. The server wraps the official Proton Drive CLI and uses the current OS user's CLI session.

## Workflow

1. Start with `proton_drive_diagnose` when setup or auth state is unknown.
2. Use `proton_drive_setup` when the CLI may be missing; it can install the latest official Proton Drive CLI for the current OS/CPU and verifies Proton's SHA-512 checksum before use.
3. If unauthenticated, call `proton_drive_auth_login`, surface any returned URL, and ask the user to finish browser sign-in. This tool starts login in the background and returns quickly.
4. If the user asks what happened to login, call `proton_drive_auth_login_status`.
5. Use `/my-files` as the default root for user-owned files.
6. Use POSIX-style remote paths even on Windows, for example `/my-files/Reports/file.pdf`.
7. Prefer JSON-returning tools over raw CLI output.

## Safety

- Do not call `proton_drive_auth_logout` unless the user explicitly asks to log out.
- Do not permanently delete, empty trash, remove sharing access, or accept/reject invitations unless the user explicitly confirms the action.
- Do not write text files unless the user explicitly confirms the destination path and content.
- Do not ask for or pass custom public-link passwords through this MCP server; the current official CLI accepts them only as command-line arguments.
- For upload/download, ask for a concrete local path when it is not clear from context.
- Do not request or handle Proton passwords; login is browser-based through the official CLI.

## Useful Tools

- `proton_drive_diagnose` and `proton_drive_setup` for first-run checks.
- `proton_drive_list` for browsing folders; use `limit` and `offset` to keep output small.
- `proton_drive_cli_install` for explicit install or update to the official latest CLI.
- `proton_drive_info` for metadata.
- `proton_drive_create_folder` before uploads into a new location.
- `proton_drive_upload` and `proton_drive_download` for transfers.
- `proton_drive_upload_async`, `proton_drive_download_async`, and `proton_drive_job_status` for large or slow transfers.
- `proton_drive_read_text` and `proton_drive_write_text` for small UTF-8 files.
- `proton_drive_sharing_status` before changing access.
- `proton_drive_cli_help` when a Proton CLI behavior or flag is unclear.
