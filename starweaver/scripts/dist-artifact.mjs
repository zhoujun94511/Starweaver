import fs from 'node:fs';
import path from 'node:path';

export const ARTIFACT_RE = /^starweaver-(\d+\.\d+\.\d+)-(\d{8})-(\d{6})\.html$/;

export function readVersion(rootDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version || '')) {
    throw new Error(`package.json version must be x.y.z, got ${pkg.version}`);
  }
  return pkg.version;
}

export function formatBuildStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const zone = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return {
    fileStamp: `${year}${month}${day}-${hour}${minute}${second}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`,
    display: `${year}-${month}-${day} ${hour}:${minute}:${second} ${zone}`
  };
}

export function artifactFileName(version, fileStamp) {
  return `starweaver-${version}-${fileStamp}.html`;
}

export function listArtifacts(distDir) {
  if (!fs.existsSync(distDir)) return [];
  return fs.readdirSync(distDir).filter((name) => ARTIFACT_RE.test(name)).sort();
}

export function findLatestArtifact(distDir) {
  const names = listArtifacts(distDir);
  if (names.length === 0) return null;
  return path.join(distDir, names[names.length - 1]);
}
