# MCP Server Template

This is a template for creating a Model Context Protocol (MCP) server. It provides a basic structure and example configuration to help you get started with building your own MCP server.

## Shell Command Configuration

The MCP whitelist shell allows you to configure which shell commands are allowed or denied through a JSON configuration file. This helps in creating a secure environment for executing shell commands.

### Configuration File

The configuration file is written in JSON format and is loaded from the path specified by the `MCP_CONFIG_PATH` environment variable.

A sample configuration file is provided at `mcp-config.sample.json`.

### Configuration Structure

```json
{
  "allowedDirectories": ["/Users/username/projects", "/tmp/safe-directory"],
  "allowCommands": [
    "ls",
    "echo",
    "cat",
    {
      "command": "git",
      "subCommands": ["status", "log", "diff", "grep"]
    },
    {
      "command": "npm",
      "denySubCommands": ["install", "uninstall", "update", "audit"]
    }
  ],
  "denyCommands": [
    {
      "command": "rm",
      "message": "rm command is dangerous. Please use trash command instead"
    },
    {
      "command": "find",
      "message": "Use git grep instead of find"
    },
    {
      "command": "regex:.*sudo.*",
      "message": "sudo commands are not allowed for security reasons"
    }
  ],
  "defaultErrorMessage": "This command is not allowed. Please contact system administrator."
}
```

### Configuration Options

1. **allowedDirectories**: List of directories where commands can be executed

   - Commands can only be executed in these directories or their subdirectories
   - If empty, no directories are allowed

2. **allowCommands**: Defines which commands are allowed to be executed

   - An array of strings or objects specifying allowed commands
   - String values (e.g., "ls") allow the command with all subcommands
   - Object format with `command` and optional `subCommands` array restricts to specific subcommands
   - Object format with `command` and optional `denySubCommands` array allows all subcommands except those specified
   - Examples:
     - `{"command": "git", "subCommands": ["status", "log"]}` - Only allows git with status and log subcommands
     - `{"command": "npm", "denySubCommands": ["install", "uninstall"]}` - Allows npm with any subcommand except install and uninstall

3. **denyCommands**: Specifies commands that are explicitly denied

   - An array of strings or objects specifying denied commands
   - String values simply deny the command
   - Object format with `command` and optional `message`
   - Supports regex patterns with `regex:` prefix for pattern matching
   - Example: `{"command": "rm", "message": "Use git rm instead"}`

4. **defaultErrorMessage**: The default error message displayed when a command is not in the allowlist

### Environment Variables

- `MCP_CONFIG_PATH`: Path to the configuration file (default: `./mcp-config.json`)
- `MCP_ALLOWED_DIRECTORIES`: Colon-separated list of directories where commands can be executed (deprecated, use `allowedDirectories` in config file instead)
