# Plugin Infrastructure

## Description
Claude Code plugin manifest and configuration. Defines plugin metadata, version, default settings, and local permissions. Bridges between Claude Code's plugin system and the professor's skills/commands/agents.

## Concepts Involved
- `design_patterns`
- `twelve_factor_app`

## Depended On By
- [[teaching-skills]]
- [[architecture-analyzer]]
- [[design-conversation]]

## Key Files
- .claude-plugin/plugin.json
- .claude-plugin/marketplace.json
- config/default_config.json
- .claude/settings.local.json

## Patterns
- Plugin manifest pattern
- Default configuration with override
- Permission allowlisting
