const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// IMPORTANT: Do NOT reference monorepo root node_modules.
// Keep Metro self-contained to apps/mobile for reliable local + EAS behavior.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Keep your @ alias working (maps @ -> apps/mobile)
config.resolver.extraNodeModules = {
  '@': projectRoot,
};

module.exports = config;
