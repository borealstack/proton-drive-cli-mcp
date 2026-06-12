# MCP Tools

All remote paths use Proton Drive POSIX paths, for example `/my-files/Reports`.

## Authentication

`proton_drive_diagnose`

Checks CLI discovery, managed install status, version, PATH status, auth state,
and the next setup action. Input:

```json
{ "includeAuth": true, "fresh": false }
```

`proton_drive_setup`

Installs the official CLI if it is missing, then runs the same diagnosis. Input:

```json
{ "installIfMissing": true, "managePath": true, "includeAuth": true }
```

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
{ "force": false, "managePath": true }
```

The install result includes `pathStatus`. On Windows, the installer adds the
managed install directory to the user PATH when possible so new terminals can
run `proton-drive`.

`proton_drive_cli_version`

Returns the CLI and SDK versions. Input:

```json
{ "fresh": false }
```

`proton_drive_cli_help`

Returns root or command help. Input:

```json
{ "topic": "filesystem_upload" }
```

## Filesystem

`proton_drive_list`

```json
{ "path": "/my-files", "type": "folder", "limit": 200, "offset": 0 }
```

The MCP server bounds list output to reduce token usage. The result includes
`totalItems`, `returnedItems`, `offset`, `limit`, and `truncated`.

`proton_drive_list_async`

Starts a background list job and returns a `jobId`:

```json
{ "path": "/my-files", "captureMs": 100, "maxSessionMs": 120000 }
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

`proton_drive_upload_async`

Starts a background upload job and returns a `jobId`:

```json
{
  "localPaths": ["<local-report-path>"],
  "parentPath": "/my-files/Reports",
  "conflictStrategy": "skip",
  "captureMs": 250,
  "maxSessionMs": 3600000
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

`proton_drive_download_async`

Starts a background download job and returns a `jobId`:

```json
{
  "paths": ["/my-files/Reports/report.pdf"],
  "localFolder": "<local-download-folder>",
  "captureMs": 250,
  "maxSessionMs": 3600000
}
```

`proton_drive_job_status`

Inspects one background job, or all retained jobs if no `jobId` is provided:

```json
{ "jobId": "upload-..." }
```

Captured stdout/stderr are returned as bounded previews with byte counts. If a
completed job produced parseable JSON, raw stdout is suppressed to avoid
duplicate payloads. JSON arrays are summarized to the first 50 compact items
with `totalItems` and `truncated` metadata.

`proton_drive_job_cancel`

Cancels a running background job:

```json
{ "jobId": "upload-...", "confirm": true }
```

`proton_drive_read_text`

Downloads one small file to a temporary directory, rejects binary or oversized
content, and returns UTF-8 text:

```json
{ "path": "/my-files/Notes/todo.txt", "maxBytes": 262144 }
```

`proton_drive_write_text`

Writes a small UTF-8 file through a temporary local file and uploads it:

```json
{
  "path": "/my-files/Notes/todo.txt",
  "text": "hello",
  "conflictStrategy": "replace",
  "confirm": true
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
