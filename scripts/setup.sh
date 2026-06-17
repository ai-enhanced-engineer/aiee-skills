#!/bin/bash
# AIEE Team Plugin Setup Script
# Adds plugin directory to Claude Code configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "AIEE Team Plugin Setup"
echo "======================"
echo ""
echo "Plugin directory: $PLUGIN_DIR"
echo ""
echo "To use this plugin, start Claude Code with:"
echo ""
echo "    claude --plugin-dir \"$PLUGIN_DIR\""
echo ""
echo "Or add an alias to your shell profile:"
echo ""
echo "    alias claude-aiee='claude --plugin-dir \"$PLUGIN_DIR\"'"
echo ""
echo "For permanent installation, add the AIEE marketplace:"
echo ""
echo "    /plugin marketplace add ai-enhanced-engineer/aiee-skills"
echo "    /plugin install aiee-skills@aiee-skills"
echo ""
