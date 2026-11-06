#!/usr/bin/env node
// Builds the Next-Class helper (Go) for all platforms into helper/dist/<goos>-<goarch>/.
//   npm run build:helper            all targets
//   npm run build:helper -- host    only the current platform
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperDir = path.join(root, 'helper');
const goos = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const goarch = process.arch === 'x64' ? 'amd64' : process.arch;
const all = [['windows', 'amd64'], ['darwin', 'arm64'], ['darwin', 'amd64'], ['linux', 'amd64']];
const targets = process.argv.includes('host') ? [[goos, goarch]] : all;

for (const [os, arch] of targets) {
    const out = path.join(helperDir, 'dist', `${os}-${arch}`, os === 'windows' ? 'nextclass-helper.exe' : 'nextclass-helper');
    execFileSync('go', ['build', '-trimpath', '-ldflags', '-s -w', '-o', out, '.'], {
        cwd: helperDir,
        stdio: 'inherit',
        env: { ...process.env, CGO_ENABLED: '0', GOOS: os, GOARCH: arch },
    });
    console.log(`✅ helper ${os}/${arch} -> ${path.relative(root, out)}`);
}
