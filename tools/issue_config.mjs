import path from 'node:path';

export const ROOT = process.cwd();
export const ISSUE = process.env.ISSUE || '202603';
export const ISSUE_DIR = path.join(ROOT, ISSUE);
export const EXPORTS_DIR = path.join(ROOT, 'exports');

export function issueOutputName(baseName) {
  return baseName.replace('202603', ISSUE);
}

export function issuePath(...parts) {
  return path.join(ROOT, ISSUE, ...parts);
}
