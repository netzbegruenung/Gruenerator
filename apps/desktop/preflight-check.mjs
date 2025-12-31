#!/usr/bin/env node
/**
 * Pre-flight check for desktop builds
 * Catches common issues before pushing to CI
 *
 * Run: node scripts/preflight-check.mjs
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');
const frontendDir = resolve(projectRoot, 'apps/web');
const desktopDir = resolve(__dirname, '..');

const checks = [];
let hasErrors = false;

function log(icon, message) {
  console.log(`${icon} ${message}`);
}

function pass(message) {
  checks.push({ status: 'pass', message });
  log('✅', message);
}

function fail(message, details) {
  checks.push({ status: 'fail', message, details });
  hasErrors = true;
  log('❌', message);
  if (details) console.log(`   ${details}`);
}

function warn(message) {
  checks.push({ status: 'warn', message });
  log('⚠️', message);
}

// Check 1: TypeScript compilation
console.log('\n📋 Running pre-flight checks...\n');

try {
  execSync('npx tsc --noEmit', { cwd: frontendDir, stdio: 'pipe' });
  pass('TypeScript compilation successful');
} catch (e) {
  const output = e.stdout?.toString() || e.stderr?.toString() || '';
  fail('TypeScript compilation failed', output.split('\n').slice(0, 5).join('\n'));
}

// Check 2: Tauri plugin imports are resolvable
const frontendPkg = JSON.parse(readFileSync(resolve(frontendDir, 'package.json'), 'utf8'));
const tauriPlugins = [
  '@tauri-apps/api',
  '@tauri-apps/plugin-shell',
];

for (const plugin of tauriPlugins) {
  if (frontendPkg.dependencies?.[plugin] || frontendPkg.devDependencies?.[plugin]) {
    pass(`${plugin} is in package.json`);
  } else {
    fail(`${plugin} missing from frontend dependencies`);
  }
}

// Check 3: Vite config has isTauri detection
const viteConfig = readFileSync(resolve(frontendDir, 'vite.config.ts'), 'utf8');
if (viteConfig.includes('TAURI_ENV_PLATFORM') || viteConfig.includes('isTauri')) {
  pass('Vite config has Tauri detection');
} else {
  warn('Vite config may not detect Tauri builds correctly');
}

// Check 4: Tauri.conf.json exists and is valid
const tauriConfigPath = resolve(desktopDir, 'src-tauri/tauri.conf.json');
if (existsSync(tauriConfigPath)) {
  try {
    JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    pass('tauri.conf.json is valid JSON');
  } catch {
    fail('tauri.conf.json is not valid JSON');
  }
} else {
  fail('tauri.conf.json not found');
}

// Check 5: Cargo.toml has required plugins
const cargoPath = resolve(desktopDir, 'src-tauri/Cargo.toml');
if (existsSync(cargoPath)) {
  const cargo = readFileSync(cargoPath, 'utf8');
  const requiredPlugins = ['tauri-plugin-shell', 'tauri-plugin-opener', 'tauri-plugin-deep-link'];
  for (const plugin of requiredPlugins) {
    if (cargo.includes(plugin)) {
      pass(`Cargo.toml has ${plugin}`);
    } else {
      warn(`Cargo.toml missing ${plugin} (may be okay)`);
    }
  }
}

// Check 6: Try Vite build in dry-run mode
console.log('\n📦 Testing frontend build...\n');
try {
  execSync('cross-env TAURI_ENV_PLATFORM=test NODE_OPTIONS=--max-old-space-size=2048 vite build --mode production', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  });
  pass('Frontend build successful');
} catch {
  fail('Frontend build failed');
}

// Summary
console.log('\n' + '─'.repeat(50));
console.log('📊 Summary\n');

const passed = checks.filter(c => c.status === 'pass').length;
const failed = checks.filter(c => c.status === 'fail').length;
const warned = checks.filter(c => c.status === 'warn').length;

console.log(`   Passed:  ${passed}`);
console.log(`   Failed:  ${failed}`);
console.log(`   Warnings: ${warned}`);
console.log('');

if (hasErrors) {
  console.log('❌ Pre-flight check FAILED. Fix issues before pushing to CI.');
  process.exit(1);
} else {
  console.log('✅ Pre-flight check PASSED. Ready for CI!');
  process.exit(0);
}
