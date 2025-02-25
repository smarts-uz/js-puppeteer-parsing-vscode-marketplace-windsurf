#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Setting up VSCode Extension Scraper...');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create .env file if it doesn't exist
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.log('Creating default .env file...');
  fs.writeFileSync(envPath, 'NODE_ENV=production\n');
}

// Ensure CLI script is executable
const cliPath = path.join(__dirname, '../src/cli.js');
try {
  if (process.platform !== 'win32') {
    console.log('Setting executable permissions on CLI script...');
    execSync(`chmod +x ${cliPath}`);
  }
} catch (error) {
  console.warn('Warning: Could not set executable permissions on CLI script.');
  console.warn('You may need to run: chmod +x src/cli.js');
}

console.log('Setup complete! You can now use the vscode-scraper command.');
console.log('Example usage: vscode-scraper C:\\VSCodeExtensions'); 