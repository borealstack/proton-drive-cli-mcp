export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "proton_drive_auth_status",
    title: "Proton Drive Auth Status",
    description: "Check whether the Proton Drive CLI can access the logged-in account.",
  },
  {
    name: "proton_drive_auth_login",
    title: "Proton Drive Auth Login",
    description: "Start the official Proton Drive CLI browser login flow in the background.",
  },
  {
    name: "proton_drive_auth_login_status",
    title: "Proton Drive Auth Login Process Status",
    description: "Inspect the background Proton Drive CLI login process.",
  },
  {
    name: "proton_drive_auth_login_cancel",
    title: "Cancel Proton Drive Auth Login",
    description: "Cancel the background Proton Drive CLI login process.",
  },
  {
    name: "proton_drive_auth_logout",
    title: "Proton Drive Auth Logout",
    description: "Log out the official Proton Drive CLI from the current OS user.",
  },
  {
    name: "proton_drive_cli_install",
    title: "Install Proton Drive CLI",
    description: "Install or update the official Proton Drive CLI for this system.",
  },
  {
    name: "proton_drive_cli_version",
    title: "Proton Drive CLI Version",
    description: "Show the Proton Drive CLI and SDK versions.",
  },
  {
    name: "proton_drive_cli_help",
    title: "Proton Drive CLI Help",
    description: "Show help for the root CLI or a supported command.",
  },
  { name: "proton_drive_list", title: "List Proton Drive Folder", description: "List children under a Proton Drive path." },
  { name: "proton_drive_info", title: "Get Proton Drive Node Info", description: "Get metadata for a Proton Drive file or folder." },
  { name: "proton_drive_create_folder", title: "Create Proton Drive Folder", description: "Create a folder under a Proton Drive parent path." },
  { name: "proton_drive_upload", title: "Upload To Proton Drive", description: "Upload one or more local files or folders." },
  { name: "proton_drive_download", title: "Download From Proton Drive", description: "Download one or more Proton Drive paths." },
  { name: "proton_drive_rename", title: "Rename Proton Drive Node", description: "Rename a Proton Drive file or folder." },
  { name: "proton_drive_copy", title: "Copy Proton Drive Nodes", description: "Copy one or more Proton Drive nodes." },
  { name: "proton_drive_move", title: "Move Proton Drive Nodes", description: "Move one or more Proton Drive nodes." },
  { name: "proton_drive_trash", title: "Trash Proton Drive Nodes", description: "Move Proton Drive files or folders to trash." },
  { name: "proton_drive_restore", title: "Restore Proton Drive Nodes", description: "Restore Proton Drive files or folders from trash." },
  { name: "proton_drive_delete", title: "Permanently Delete Proton Drive Nodes", description: "Permanently delete Proton Drive files or folders." },
  { name: "proton_drive_empty_trash", title: "Empty Proton Drive Trash", description: "Permanently delete everything in Proton Drive trash." },
  { name: "proton_drive_sharing_status", title: "Proton Drive Sharing Status", description: "Show sharing status for a Proton Drive path." },
  { name: "proton_drive_sharing_invite", title: "Invite Proton Drive Users", description: "Invite Proton users to a shared path." },
  { name: "proton_drive_sharing_remove", title: "Remove Proton Drive Sharing Access", description: "Remove user access entries." },
  {
    name: "proton_drive_sharing_set_url",
    title: "Create Or Update Proton Drive Public Link",
    description: "Create or update a public sharing URL without passing custom link passwords through command-line arguments.",
  },
  { name: "proton_drive_sharing_remove_url", title: "Remove Proton Drive Public Link", description: "Remove a public sharing URL." },
  { name: "proton_drive_invitation_list", title: "List Proton Drive Invitations", description: "List pending Proton Drive invitations." },
  { name: "proton_drive_invitation_accept", title: "Accept Proton Drive Invitation", description: "Accept a Proton Drive invitation by UID." },
  { name: "proton_drive_invitation_reject", title: "Reject Proton Drive Invitation", description: "Reject a Proton Drive invitation by UID." },
];
