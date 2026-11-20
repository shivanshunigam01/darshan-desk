import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zipPath = path.join(releaseDir, `darshandesk-extension-v${version}.zip`);

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first — dist/ missing');
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

if (process.platform === 'win32') {
  const psDist = dist.replace(/'/g, "''");
  const psZip = zipPath.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${psDist}\\*' -DestinationPath '${psZip}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${dist}" && zip -qr "${zipPath}" .`, { stdio: 'inherit', shell: true });
}

console.log(`Created ${zipPath}`);