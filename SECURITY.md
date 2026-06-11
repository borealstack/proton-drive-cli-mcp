# Security

## Supported Versions

Only the current development branch and the latest tagged release receive
security fixes.

## Credential Handling

This server does not ask for Proton credentials and does not store Proton
sessions. Authentication stays delegated to the official Proton Drive CLI and
the operating-system credential store used by that CLI.

The server also avoids accepting custom public-link passwords through MCP tool
arguments, because command-line arguments can be visible to local process
inspection tools.

## Reporting Vulnerabilities

Please report suspected vulnerabilities through GitHub issues if public
discussion is acceptable. If the report contains private reproduction details,
open a minimal issue asking for a private contact path first.

Do not include real Proton credentials, session data, private file contents, or
share-link passwords in reports.
