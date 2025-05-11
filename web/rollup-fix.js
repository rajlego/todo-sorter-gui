#!/usr/bin/env node

// rollup-fix.js - This script creates empty shims for native dependencies to prevent build errors
const fs = require('fs');
const path = require('path');

// Define the path to node_modules
const nodeModulesPath = path.join(process.cwd(), 'node_modules');

// Get current platform
const platform = process.platform;
const arch = process.arch;

// List of all possible rollup binding packages we might need to handle
const rollupBindings = [
  '@rollup/rollup-linux-x64-gnu',
  '@rollup/rollup-linux-x64-musl',
  '@rollup/rollup-darwin-x64',
  '@rollup/rollup-darwin-arm64',
  '@rollup/rollup-win32-x64-msvc'
];

console.log('Creating shims for Rollup native dependencies...');

// Create a directory for each package and add a basic index.js
rollupBindings.forEach(binding => {
  const bindingPath = path.join(nodeModulesPath, binding);
  
  // Check if the directory already exists
  if (!fs.existsSync(bindingPath)) {
    console.log(`Creating shim for ${binding}...`);
    
    // Create the directory
    fs.mkdirSync(bindingPath, { recursive: true });
    
    // Create a simple index.js that exports an empty object
    fs.writeFileSync(
      path.join(bindingPath, 'index.js'),
      'module.exports = {};'
    );
    
    // Create a package.json
    fs.writeFileSync(
      path.join(bindingPath, 'package.json'),
      JSON.stringify({
        name: binding,
        version: '0.0.1',
        description: 'Shim for Rollup native binding',
        main: 'index.js'
      }, null, 2)
    );
  } else {
    console.log(`Shim for ${binding} already exists`);
  }
});

console.log('All Rollup shims created successfully!'); 