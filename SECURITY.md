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

Please report suspected vulnerabilities privately through GitHub Security
Advisories:

https://github.com/borealstack/proton-drive-cli-mcp/security/advisories/new

If private vulnerability reporting is unavailable, open a minimal public issue
asking for a private contact path. Do not include private reproduction details
in the public issue.

The project aims to acknowledge vulnerability reports within 7 days and publish
coordinated disclosure updates once a fix or mitigation is available.

Do not include real Proton credentials, session data, private file contents, or
share-link passwords in reports.
