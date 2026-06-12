import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ProtonDriveCli } from "./cli.js";
import { formatAuthLoginSnapshot, formatBackgroundSnapshot, prettyResult } from "./format.js";
import type { CommandResult, JsonCommandResult } from "./types.js";

const remotePath = z.string().min(1).describe("Proton Drive POSIX path, for example /my-files/Reports.");
const localPath = z.string().min(1).describe("Local filesystem path.");
const conflictStrategy = z.enum(["merge", "keep-both", "replace", "skip"]);
const nodeType = z.enum(["file", "folder", "album", "photo"]);
const inviteRole = z.enum(["viewer", "editor", "admin"]);
const publicLinkRole = z.enum(["viewer", "editor"]);
const confirm = z.literal(true).describe("Must be true to confirm this operation.");
const captureMs = z.number().int().min(0).max(10_000).default(250);
const transferSessionMs = z.number().int().min(30_000).max(86_400_000).default(3_600_000);
const listLimit = z.number().int().min(1).max(1_000).default(200);
const listOffset = z.number().int().min(0).default(0);
const textMaxBytes = z.number().int().min(1).max(5_000_000).default(262_144);

export function createServer(cli = new ProtonDriveCli()): McpServer {
  const server = new McpServer({
    name: "proton-drive-cli-mcp",
    version: "0.1.2",
  });

  server.registerTool(
    "proton_drive_diagnose",
    {
      title: "Diagnose Proton Drive MCP Setup",
      description: "Check CLI discovery, managed install status, version, PATH status, authentication, and the next setup action.",
      inputSchema: z.object({
        includeAuth: z.boolean().default(true).describe("Check authentication by asking the CLI to list /my-files."),
        fresh: z.boolean().default(false).describe("Bypass cached auth/version checks."),
      }),
    },
    async ({ includeAuth, fresh }) => textResult(await cli.diagnose({ includeAuth, fresh })),
  );

  server.registerTool(
    "proton_drive_setup",
    {
      title: "Set Up Proton Drive MCP",
      description: "Install the official CLI if needed, then diagnose CLI discovery, PATH status, version, and authentication.",
      inputSchema: z.object({
        installIfMissing: z.boolean().default(true).describe("Install the official CLI if it cannot be found."),
        managePath: z.boolean().default(true).describe("Add the managed CLI directory to PATH where supported."),
        includeAuth: z.boolean().default(true).describe("Check authentication by asking the CLI to list /my-files."),
        fresh: z.boolean().default(false).describe("Bypass cached auth/version checks."),
      }),
    },
    async (input) => textResult(await cli.setup(input)),
  );

  server.registerTool(
    "proton_drive_auth_status",
    {
      title: "Proton Drive Auth Status",
      description: "Check whether the Proton Drive CLI can access the logged-in account.",
      inputSchema: z.object({
        fresh: z.boolean().default(false).describe("Bypass the short successful-auth cache and call the Proton CLI."),
      }),
    },
    async ({ fresh }) => {
      const status = await cli.authStatus({ fresh });
      return textResult({
        authenticated: status.authenticated,
        cliPath: status.cliPath,
        detail: status.detail,
        exitCode: status.result.exitCode,
        cached: status.cached,
      });
    },
  );

  server.registerTool(
    "proton_drive_auth_login",
    {
      title: "Proton Drive Auth Login",
      description: "Start the official Proton Drive CLI browser login flow and return quickly instead of waiting for login completion.",
      inputSchema: z.object({
        captureMs: z.number().int().min(0).max(10_000).default(3_000).describe("Milliseconds to capture initial CLI output before returning."),
        maxSessionMs: z.number().int().min(30_000).max(900_000).default(600_000).describe("Maximum background login process lifetime."),
      }),
    },
    async ({ captureMs, maxSessionMs }) => {
      const status = await cli.authStatus();
      if (status.authenticated) {
        return textResult({
          status: "already_authenticated",
          loginUrls: [],
          message: "The Proton Drive CLI is already authenticated.",
          cliPath: status.cliPath,
        });
      }

      return textResult(formatAuthLoginSnapshot(await cli.startAuthLogin({ captureMs, maxSessionMs })));
    },
  );

  server.registerTool(
    "proton_drive_auth_login_status",
    {
      title: "Proton Drive Auth Login Process Status",
      description: "Inspect the background Proton Drive CLI login process started by proton_drive_auth_login.",
      inputSchema: z.object({}),
    },
    async () => {
      const snapshot = cli.authLoginSnapshot();
      return textResult(
        snapshot
          ? formatAuthLoginSnapshot(snapshot)
          : {
              status: "not_started",
              loginUrls: [],
              message: "No background Proton Drive CLI login process has been started by this MCP server instance.",
            },
      );
    },
  );

  server.registerTool(
    "proton_drive_auth_login_cancel",
    {
      title: "Cancel Proton Drive Auth Login",
      description: "Cancel the background Proton Drive CLI login process started by proton_drive_auth_login.",
      inputSchema: z.object({ confirm }),
    },
    async () => {
      const snapshot = cli.cancelAuthLogin();
      return textResult(
        snapshot
          ? formatAuthLoginSnapshot(snapshot)
          : {
              status: "not_started",
              loginUrls: [],
              message: "No background Proton Drive CLI login process was active.",
            },
      );
    },
  );

  server.registerTool(
    "proton_drive_auth_logout",
    {
      title: "Proton Drive Auth Logout",
      description: "Log out the official Proton Drive CLI from the current OS user.",
      inputSchema: z.object({ confirm }),
    },
    async () => commandResult(await cli.authLogout()),
  );

  server.registerTool(
    "proton_drive_cli_install",
    {
      title: "Install Proton Drive CLI",
      description: "Download the latest official Proton Drive CLI for this system, verify Proton's SHA-512 checksum, and install it to a user-local managed path.",
      inputSchema: z.object({
        force: z.boolean().default(false).describe("Overwrite the managed CLI binary if it already exists."),
        installDir: localPath.optional().describe("Optional install directory. Defaults to a user-local managed path."),
        managePath: z.boolean().default(true).describe("Add the managed CLI directory to PATH where the platform supports safe user PATH updates."),
      }),
    },
    async ({ force, installDir, managePath }) => textResult(await cli.installCli({ force, installDir, managePath })),
  );

  server.registerTool(
    "proton_drive_cli_version",
    {
      title: "Proton Drive CLI Version",
      description: "Show the Proton Drive CLI and SDK versions.",
      inputSchema: z.object({
        fresh: z.boolean().default(false).describe("Bypass the short version cache and call the Proton CLI."),
      }),
    },
    async ({ fresh }) => commandResult(await cli.version({ fresh })),
  );

  server.registerTool(
    "proton_drive_cli_help",
    {
      title: "Proton Drive CLI Help",
      description: "Show help for the root CLI or a supported command.",
      inputSchema: z.object({
        topic: z
          .enum([
            "root",
            "auth_login",
            "auth_logout",
            "filesystem_list",
            "filesystem_info",
            "filesystem_create_folder",
            "filesystem_upload",
            "filesystem_download",
            "filesystem_rename",
            "filesystem_copy",
            "filesystem_move",
            "filesystem_trash",
            "filesystem_restore",
            "filesystem_delete",
            "filesystem_empty_trash",
            "sharing_status",
            "sharing_invite",
            "sharing_remove",
            "sharing_set_url",
            "sharing_remove_url",
            "invitation_list",
            "invitation_accept",
            "invitation_reject",
          ])
          .default("root"),
      }),
    },
    async ({ topic }) => commandResult(await cli.help(helpArgs(topic))),
  );

  server.registerTool(
    "proton_drive_list",
    {
      title: "List Proton Drive Folder",
      description: "List children under a Proton Drive path with bounded output to keep responses manageable.",
      inputSchema: z.object({
        path: remotePath.default("/my-files"),
        type: nodeType.optional().describe("Optional node type filter."),
        limit: listLimit.describe("Maximum number of returned items. The full CLI response is sliced by the MCP server."),
        offset: listOffset.describe("Number of items to skip from the CLI result before returning items."),
        timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
      }),
    },
    async ({ path, type, limit, offset, timeoutMs }) => listResult(await cli.list(path, type, { timeoutMs }), { limit, offset }),
  );

  server.registerTool(
    "proton_drive_list_async",
    {
      title: "Start Background Proton Drive List",
      description: "Start a background folder listing job and return a job ID for status polling.",
      inputSchema: z.object({
        path: remotePath.default("/my-files"),
        type: nodeType.optional().describe("Optional node type filter."),
        captureMs,
        maxSessionMs: z.number().int().min(30_000).max(600_000).default(120_000),
      }),
    },
    async (input) => textResult(formatBackgroundSnapshot(await cli.startListJob(input))),
  );

  server.registerTool(
    "proton_drive_info",
    {
      title: "Get Proton Drive Node Info",
      description: "Get metadata for a Proton Drive file or folder.",
      inputSchema: z.object({ path: remotePath }),
    },
    async ({ path }) => commandResult(await cli.info(path)),
  );

  server.registerTool(
    "proton_drive_create_folder",
    {
      title: "Create Proton Drive Folder",
      description: "Create a folder under a Proton Drive parent path.",
      inputSchema: z.object({
        parentPath: remotePath.default("/my-files"),
        name: z.string().min(1),
      }),
    },
    async ({ parentPath, name }) => commandResult(await cli.createFolder(parentPath, name)),
  );

  server.registerTool(
    "proton_drive_upload",
    {
      title: "Upload To Proton Drive",
      description: "Upload one or more local files or folders to a Proton Drive parent path.",
      inputSchema: z.object({
        localPaths: z.array(localPath).min(1),
        parentPath: remotePath.default("/my-files"),
        conflictStrategy: conflictStrategy.optional(),
        fileConflictStrategy: conflictStrategy.optional(),
        folderConflictStrategy: conflictStrategy.optional(),
        skipThumbnails: z.boolean().default(false),
        timeoutMs: z.number().int().min(5_000).max(3_600_000).default(600_000),
      }),
    },
    async (input) => commandResult(await cli.upload(input)),
  );

  server.registerTool(
    "proton_drive_upload_async",
    {
      title: "Start Background Proton Drive Upload",
      description: "Start a background upload job and return a job ID for status polling or cancellation.",
      inputSchema: z.object({
        localPaths: z.array(localPath).min(1),
        parentPath: remotePath.default("/my-files"),
        conflictStrategy: conflictStrategy.optional(),
        fileConflictStrategy: conflictStrategy.optional(),
        folderConflictStrategy: conflictStrategy.optional(),
        skipThumbnails: z.boolean().default(false),
        captureMs,
        maxSessionMs: transferSessionMs,
      }),
    },
    async (input) => textResult(formatBackgroundSnapshot(await cli.startUploadJob(input))),
  );

  server.registerTool(
    "proton_drive_download",
    {
      title: "Download From Proton Drive",
      description: "Download one or more Proton Drive paths into a local folder.",
      inputSchema: z.object({
        paths: z.array(remotePath).min(1),
        localFolder: localPath,
        conflictStrategy: conflictStrategy.optional(),
        fileConflictStrategy: conflictStrategy.optional(),
        folderConflictStrategy: conflictStrategy.optional(),
        timeoutMs: z.number().int().min(5_000).max(3_600_000).default(600_000),
      }),
    },
    async (input) => commandResult(await cli.download(input)),
  );

  server.registerTool(
    "proton_drive_download_async",
    {
      title: "Start Background Proton Drive Download",
      description: "Start a background download job and return a job ID for status polling or cancellation.",
      inputSchema: z.object({
        paths: z.array(remotePath).min(1),
        localFolder: localPath,
        conflictStrategy: conflictStrategy.optional(),
        fileConflictStrategy: conflictStrategy.optional(),
        folderConflictStrategy: conflictStrategy.optional(),
        captureMs,
        maxSessionMs: transferSessionMs,
      }),
    },
    async (input) => textResult(formatBackgroundSnapshot(await cli.startDownloadJob(input))),
  );

  server.registerTool(
    "proton_drive_job_status",
    {
      title: "Proton Drive Background Job Status",
      description: "Inspect one background list, upload, or download job, or list retained jobs when no job ID is provided.",
      inputSchema: z.object({
        jobId: z.string().min(1).optional(),
      }),
    },
    async ({ jobId }) => {
      if (jobId) {
        const snapshot = cli.jobSnapshot(jobId);
        return textResult(snapshot ? formatBackgroundSnapshot(snapshot) : { status: "not_found", jobId });
      }
      return textResult(cli.jobSnapshots().map(formatBackgroundSnapshot));
    },
  );

  server.registerTool(
    "proton_drive_job_cancel",
    {
      title: "Cancel Proton Drive Background Job",
      description: "Cancel a running background list, upload, or download job.",
      inputSchema: z.object({
        jobId: z.string().min(1),
        confirm,
      }),
    },
    async ({ jobId }) => {
      const snapshot = cli.cancelJob(jobId);
      return textResult(snapshot ? formatBackgroundSnapshot(snapshot) : { status: "not_found", jobId });
    },
  );

  server.registerTool(
    "proton_drive_read_text",
    {
      title: "Read Proton Drive Text File",
      description: "Download one small Proton Drive file to a temporary directory, reject binary or oversized content, and return UTF-8 text.",
      inputSchema: z.object({
        path: remotePath,
        maxBytes: textMaxBytes,
        timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
      }),
    },
    async (input) => textResult(await cli.readText(input)),
  );

  server.registerTool(
    "proton_drive_write_text",
    {
      title: "Write Proton Drive Text File",
      description: "Write a small UTF-8 text file through a temporary local file and upload it to Proton Drive.",
      inputSchema: z.object({
        path: remotePath.describe("Destination file path, for example /my-files/Reports/note.txt."),
        text: z.string(),
        maxBytes: textMaxBytes,
        conflictStrategy: conflictStrategy.default("replace"),
        timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
        confirm,
      }),
    },
    async ({ path, text, maxBytes, conflictStrategy, timeoutMs }) => textResult(await cli.writeText({ path, text, maxBytes, conflictStrategy, timeoutMs })),
  );

  server.registerTool(
    "proton_drive_rename",
    {
      title: "Rename Proton Drive Node",
      description: "Rename a Proton Drive file or folder.",
      inputSchema: z.object({
        path: remotePath,
        newName: z.string().min(1),
      }),
    },
    async ({ path, newName }) => commandResult(await cli.rename(path, newName)),
  );

  server.registerTool(
    "proton_drive_copy",
    {
      title: "Copy Proton Drive Nodes",
      description: "Copy one or more Proton Drive nodes into a target parent folder.",
      inputSchema: z.object({
        sourcePaths: z.array(remotePath).min(1),
        targetParentPath: remotePath,
        name: z.string().min(1).optional().describe("Optional new name when copying one source."),
      }),
    },
    async ({ sourcePaths, targetParentPath, name }) => commandResult(await cli.copy(sourcePaths, targetParentPath, name)),
  );

  server.registerTool(
    "proton_drive_move",
    {
      title: "Move Proton Drive Nodes",
      description: "Move one or more Proton Drive nodes into a target parent folder.",
      inputSchema: z.object({
        sourcePaths: z.array(remotePath).min(1),
        targetParentPath: remotePath,
      }),
    },
    async ({ sourcePaths, targetParentPath }) => commandResult(await cli.move(sourcePaths, targetParentPath)),
  );

  server.registerTool(
    "proton_drive_trash",
    {
      title: "Trash Proton Drive Nodes",
      description: "Move Proton Drive files or folders to trash.",
      inputSchema: z.object({
        paths: z.array(remotePath).min(1),
        confirm,
      }),
    },
    async ({ paths }) => commandResult(await cli.trash(paths)),
  );

  server.registerTool(
    "proton_drive_restore",
    {
      title: "Restore Proton Drive Nodes",
      description: "Restore Proton Drive files or folders from trash.",
      inputSchema: z.object({
        paths: z.array(remotePath).min(1),
      }),
    },
    async ({ paths }) => commandResult(await cli.restore(paths)),
  );

  server.registerTool(
    "proton_drive_delete",
    {
      title: "Permanently Delete Proton Drive Nodes",
      description: "Permanently delete Proton Drive files or folders. This cannot be undone.",
      inputSchema: z.object({
        paths: z.array(remotePath).min(1),
        confirm,
      }),
    },
    async ({ paths }) => commandResult(await cli.delete(paths)),
  );

  server.registerTool(
    "proton_drive_empty_trash",
    {
      title: "Empty Proton Drive Trash",
      description: "Permanently delete everything in Proton Drive trash. This cannot be undone.",
      inputSchema: z.object({ confirm }),
    },
    async () => commandResult(await cli.emptyTrash()),
  );

  server.registerTool(
    "proton_drive_sharing_status",
    {
      title: "Proton Drive Sharing Status",
      description: "Show sharing status for a Proton Drive path.",
      inputSchema: z.object({ path: remotePath }),
    },
    async ({ path }) => commandResult(await cli.sharingStatus(path)),
  );

  server.registerTool(
    "proton_drive_sharing_invite",
    {
      title: "Invite Proton Drive Users",
      description: "Invite Proton users to a shared Proton Drive path.",
      inputSchema: z.object({
        path: remotePath,
        users: z.array(z.string().email()).min(1),
        role: inviteRole.default("viewer"),
        message: z.string().optional(),
        includeNodeName: z.boolean().default(false),
      }),
    },
    async (input) => commandResult(await cli.sharingInvite(input)),
  );

  server.registerTool(
    "proton_drive_sharing_remove",
    {
      title: "Remove Proton Drive Sharing Access",
      description: "Remove one or all user invitations/access entries from a Proton Drive path.",
      inputSchema: z
        .object({
          path: remotePath,
          emails: z.array(z.string().email()).min(1).optional(),
          all: z.boolean().default(false),
          confirm,
        })
        .refine((input) => input.all || (input.emails?.length ?? 0) > 0, {
          message: "Provide at least one email or set all to true.",
          path: ["emails"],
        })
        .refine((input) => !(input.all && (input.emails?.length ?? 0) > 0), {
          message: "Provide either emails or all=true, not both.",
          path: ["all"],
        }),
    },
    async ({ path, emails, all }) => commandResult(await cli.sharingRemove({ path, emails, all })),
  );

  server.registerTool(
    "proton_drive_sharing_set_url",
    {
      title: "Create Or Update Proton Drive Public Link",
      description: "Create or update a public sharing URL for a Proton Drive path. Custom link passwords are intentionally not accepted because the official CLI currently exposes them as command-line arguments.",
      inputSchema: z.strictObject({
        path: remotePath,
        role: publicLinkRole.optional(),
        expiration: z.string().optional().describe("Expiration accepted by the Proton CLI, for example an ISO date if supported."),
      }),
    },
    async (input) => commandResult(await cli.sharingSetUrl(input)),
  );

  server.registerTool(
    "proton_drive_sharing_remove_url",
    {
      title: "Remove Proton Drive Public Link",
      description: "Remove a public sharing URL from a Proton Drive path.",
      inputSchema: z.object({
        path: remotePath,
        confirm,
      }),
    },
    async ({ path }) => commandResult(await cli.sharingRemoveUrl(path)),
  );

  server.registerTool(
    "proton_drive_invitation_list",
    {
      title: "List Proton Drive Invitations",
      description: "List pending Proton Drive invitations.",
      inputSchema: z.object({}),
    },
    async () => commandResult(await cli.invitationList()),
  );

  server.registerTool(
    "proton_drive_invitation_accept",
    {
      title: "Accept Proton Drive Invitation",
      description: "Accept a Proton Drive invitation by UID.",
      inputSchema: z.object({ invitationUid: z.string().min(1), confirm }),
    },
    async ({ invitationUid }) => commandResult(await cli.invitationAccept(invitationUid)),
  );

  server.registerTool(
    "proton_drive_invitation_reject",
    {
      title: "Reject Proton Drive Invitation",
      description: "Reject a Proton Drive invitation by UID.",
      inputSchema: z.object({ invitationUid: z.string().min(1), confirm }),
    },
    async ({ invitationUid }) => commandResult(await cli.invitationReject(invitationUid)),
  );

  return server;
}

function commandResult(result: CommandResult | JsonCommandResult) {
  return {
    content: [{ type: "text" as const, text: prettyResult(result) }],
  };
}

function listResult(result: JsonCommandResult, options: { limit: number; offset: number }) {
  if (!Array.isArray(result.json)) return commandResult(result);
  const totalItems = result.json.length;
  const items = result.json.slice(options.offset, options.offset + options.limit);
  return textResult({
    items,
    totalItems,
    returnedItems: items.length,
    offset: options.offset,
    limit: options.limit,
    truncated: options.offset + items.length < totalItems,
    durationMs: result.durationMs,
  });
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function helpArgs(topic: string): string[] {
  if (topic === "root") return [];
  const [group = "", ...rest] = topic.split("_");
  return [group, rest.join("-")];
}
