#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const cmd = process.argv[2];

const setup = () => {
  const script = path.join(__dirname, 'scripts', 'setup.sh');
  execSync(`bash "${script}"`, { stdio: 'inherit' });
};

const teardown = () => {
  const script = path.join(__dirname, 'scripts', 'teardown.sh');
  execSync(`bash "${script}"`, { stdio: 'inherit' });
};

switch (cmd) {
  case 'setup':
  case 'install':
    setup();
    break;
  case 'remove':
  case 'uninstall':
    teardown();
    break;
  default:
    console.log('adline — AI Statusline Ad Network');
    console.log('');
    console.log('Usage:');
    console.log('  adline setup      — inject statusLine hook into Claude Code');
    console.log('  adline remove     — remove hook');
    console.log('');
    console.log('Docs: https://adline.dev');
}
