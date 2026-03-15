# AI PvP Bot Mineflayer Package

This repository contains a pre-built mineflayer package with all dependencies for the AI PvP Bot Fabric mod.

## Contents

- `package.json` - Node.js package configuration with mineflayer dependencies
- `bot_template.js` - Bot template with multiple connection configurations
- `node_modules/` - Pre-installed dependencies (will be added after npm install)

## Usage

This package is automatically downloaded and used by the AI PvP Bot Fabric mod. Users don't need to manually install or configure anything.

## Installation for Development

If you want to set this up manually:

1. Install Node.js
2. Run `npm install` to install dependencies
3. Run `node bot_template.js <botname> <host> <port>` to start a bot

## Dependencies

- mineflayer: ^4.21.0
- minecraft-data: ^3.70.0

## License

MIT