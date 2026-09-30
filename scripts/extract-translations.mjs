// Rebuilds admin/src/translations/en.json from the default messages in the admin source, so
// the English file never drifts from what the UI actually says.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'admin', 'src');

// Messages whose id is built at runtime, which the pattern below cannot see.
const messages = {
  'plugin.name': 'A/B Testing',
  'list.column': 'A/B test',
  'status.draft': 'Not started',
  'status.running': 'Running',
  'status.paused': 'Paused',
  'status.completed': 'Completed',
};

// t('some.id', 'Default message') or rich(...), with either quote style around the message.
const pattern = /\b(?:t|rich)\(\s*'([^']+)',\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gs;

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]
  );

for (const file of walk(root).filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
    messages[match[1]] = (match[2] ?? match[3]).replace(/\\'/g, "'");
  }
}

const sorted = Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(join(root, 'translations', 'en.json'), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${Object.keys(sorted).length} messages`);
