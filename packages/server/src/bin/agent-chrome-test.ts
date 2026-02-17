#!/usr/bin/env node

/**
 * CLI entry point for agent-chrome-test server.
 *
 * Usage:
 *   npx agent-chrome-test              # Start in standalone mode
 *   npx agent-chrome-test --port 4000  # Custom port
 *
 * As MCP server (via stdin/stdout):
 *   Configured in claude_desktop_config.json or .claude/settings.json
 */

// Import the main module which handles both MCP and standalone modes
import '../index.js';
