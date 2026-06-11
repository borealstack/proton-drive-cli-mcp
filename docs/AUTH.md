# Authentication

This MCP server delegates authentication to the official Proton Drive CLI.

The Proton CLI uses browser sign-in and stores sessions in the operating system secret store. Proton's CLI README documents these stores as Windows Credential Manager, macOS Keychain Services, or Linux libsecret, with credentials under `ch.proton.drive/drive-sdk-cli`.

## First Use

1. Call `proton_drive_auth_status`.
2. If it reports unauthenticated, call `proton_drive_auth_login`.
3. The login tool starts the CLI login flow in the background and returns quickly. If the CLI prints a login URL, the MCP tool returns it. If the CLI opens the browser directly, finish that flow.
4. Call `proton_drive_auth_status` again.

Use `proton_drive_auth_login_status` to inspect the background login process. Use `proton_drive_auth_login_cancel` with `confirm: true` to stop a pending login.

## CLI Path

Set `PROTON_DRIVE_CLI_PATH` when the CLI is not on PATH.

If no CLI is found and `PROTON_DRIVE_CLI_PATH` is not set, the server auto-installs the latest official CLI listed at `https://proton.me/download/drive/cli/index.html`. The download is selected for the current OS and CPU architecture and verified against Proton's SHA-512 checksum before use.

Set `PROTON_DRIVE_CLI_AUTO_INSTALL=0` to disable automatic installation. Set `PROTON_DRIVE_CLI_INSTALL_DIR` to choose a custom managed install directory.

Windows example:

```powershell
$env:PROTON_DRIVE_CLI_PATH = "<path-to-proton-drive.exe>"
```

macOS/Linux example:

```bash
export PROTON_DRIVE_CLI_PATH="<path-to-proton-drive>"
```

## Logout

Use `proton_drive_auth_logout` with `confirm: true`. This removes the current official CLI session for the OS user.
