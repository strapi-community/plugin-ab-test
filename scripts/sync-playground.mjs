// Copies the built plugin into the playground, which loads it from there (see
// playground/config/plugins.ts). A symlink to this repo would make the admin panel resolve a
// second copy of React from the plugin's own node_modules.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'playground/.ab-test');

if (!existsSync(join(root, 'dist'))) {
  console.error('Nothing to sync: run "npm run build" first.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(root, 'dist'), join(target, 'dist'), { recursive: true });
cpSync(join(root, 'package.json'), join(target, 'package.json'));

console.log(`Synced plugin build to ${target}`);
