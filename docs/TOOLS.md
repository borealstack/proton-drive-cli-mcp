# MCP Tools

All remote paths use Proton Drive POSIX paths, for example `/my-files/Reports`.

## Authentication

`proton_drive_auth_status`

Checks if the CLI can list `/my-files`.

`proton_drive_auth_login`

Starts the official CLI browser sign-in flow in a background process and returns quickly. Input:

```json
{ "captureMs": 3000, "maxSessionMs": 600000 }
```

`captureMs` controls how long the MCP tool waits for initial CLI output such as a login URL. It does not wait for login completion.

`proton_drive_auth_login_status`

Returns the current background login process state and any captured URL/output.

`proton_drive_auth_login_cancel`

Stops the background login process. Input:

```json
{ "confirm": true }
```

`proton_drive_auth_logout`

Logs out the current CLI session. Input:

```json
{ "confirm": true }
```

## CLI Metadata

`proton_drive_cli_install`

Downloads the latest official Proton Drive CLI for the current OS/CPU, verifies Proton's SHA-512 checksum, and installs it to a user-local managed path. Input:

```json
{ "force": false }
```

`proton_drive_cli_version`

Returns the CLI and SDK versions.

`proton_drive_cli_help`

Returns root or command help. Input:

```json
{ "topic": "filesystem_upload" }
```

## Filesystem

`proton_drive_list`

```json
{ "path": "/my-files", "type": "folder" }
```

`proton_drive_info`

```json
{ "path": "/my-files/Reports" }
```

`proton_drive_create_folder`

```json
{ "parentPath": "/my-files", "name": "Reports" }
```

`proton_drive_upload`

```json
{
  "localPaths": ["<local-report-path>"],
  "parentPath": "/my-files/Reports",
  "conflictStrategy": "skip",
  "skipThumbnails": true,
  "timeoutMs": 600000
}
```

`proton_drive_download`

```json
{
  "paths": ["/my-files/Reports/report.pdf"],
  "localFolder": "<local-download-folder>",
  "conflictStrategy": "replace",
  "timeoutMs": 600000
}
```

`proton_drive_rename`

```json
{ "path": "/my-files/Reports", "newName": "Reports 2026" }
```

`proton_drive_copy`

```json
{
  "sourcePaths": ["/my-files/Reports/report.pdf"],
  "targetParentPath": "/my-files/Archive",
  "name": "report-copy.pdf"
}
```

`proton_drive_move`

```json
{
  "sourcePaths": ["/my-files/Reports/report.pdf"],
  "targetParentPath": "/my-files/Archive"
}
```

`proton_drive_trash`

```json
{ "paths": ["/my-files/Archive/report.pdf"], "confirm": true }
```

`proton_drive_restore`

```json
{ "paths": ["/my-files/Archive/report.pdf"] }
```

`proton_drive_delete`

```json
{ "paths": ["/my-files/Archive/report.pdf"], "confirm": true }
```

`proton_drive_empty_trash`

```json
{ "confirm": true }
```

## Sharing

`proton_drive_sharing_status`

```json
{ "path": "/my-files/Reports" }
```

`proton_drive_sharing_invite`

```json
{
  "path": "/my-files/Reports",
  "users": ["person@example.com"],
  "role": "viewer",
  "message": "Please review",
  "includeNodeName": true
}
```

`proton_drive_sharing_remove`

```json
{
  "path": "/my-files/Reports",
  "emails": ["person@example.com"],
  "confirm": true
}
```

Use either `emails` or `"all": true`; the tool rejects requests that provide neither or both.

`proton_drive_sharing_set_url`

```json
{
  "path": "/my-files/Reports",
  "role": "viewer",
  "expiration": "2026-12-31"
}
```

Custom public-link passwords are intentionally not accepted by this MCP tool because the current official Proton Drive CLI exposes them only as command-line arguments.

`proton_drive_sharing_remove_url`

```json
{ "path": "/my-files/Reports", "confirm": true }
```

## Invitations

`proton_drive_invitation_list`

Lists pending invitations.

`proton_drive_invitation_accept`

```json
{ "invitationUid": "INVITATION-UID", "confirm": true }
```

`proton_drive_invitation_reject`

```json
{ "invitationUid": "INVITATION-UID", "confirm": true }
```
