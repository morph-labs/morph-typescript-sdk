#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function cmpSemver(a, b) {
  // Compare a and b as semver strings (x.y.z[-prerelease])
  const parse = (v) => {
    const [core, pre] = v.split('-');
    const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0);
    return { maj, min, pat, pre: pre || '' };
  };
  const A = parse(a);
  const B = parse(b);
  if (A.maj !== B.maj) return A.maj - B.maj;
  if (A.min !== B.min) return A.min - B.min;
  if (A.pat !== B.pat) return A.pat - B.pat;
  // Treat prerelease as lower than stable
  if (A.pre && !B.pre) return -1;
  if (!A.pre && B.pre) return 1;
  return (A.pre || '').localeCompare(B.pre || '');
}

function bumpPatch(v) {
  const [core, pre] = v.split('-');
  const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0);
  return `${maj}.${min}.${pat + 1}`;
}

function getNpmVersion(pkgName) {
  try {
    const out = execSync(`npm view ${pkgName} version`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out || null;
  } catch {
    return null; // Not published or network issue
  }
}

function main() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = readJson(pkgPath);
  const localVersion = pkg.version;
  const name = pkg.name;

  if (!localVersion) {
    console.error('No version field in package.json');
    process.exit(1);
  }
  if (!name) {
    console.error('No name field in package.json');
    process.exit(1);
  }

  const remoteVersion = getNpmVersion(name);
  if (!remoteVersion) {
    console.log(`Package '${name}' not found on npm or unreachable. Keeping version ${localVersion}.`);
    console.log(localVersion);
    return;
  }

  // If local <= remote, bump patch; else keep
  if (cmpSemver(localVersion, remoteVersion) <= 0) {
    const newVersion = bumpPatch(remoteVersion);
    pkg.version = newVersion;
    writeJson(pkgPath, pkg);
    console.log(`Bumped version: ${remoteVersion} -> ${newVersion}`);
    console.log(newVersion);
  } else {
    console.log(`Local version ${localVersion} is ahead of npm ${remoteVersion}. Keeping.`);
    console.log(localVersion);
  }
}

main();

