const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const outputPath = path.join(repoRoot, 'src', 'generated', 'buildInfo.ts');

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolveGitRef() {
  const envGitRef = (process.env.APP_BUILD_GIT_REF || '').trim();
  const envGitRefKind = (process.env.APP_BUILD_GIT_REF_KIND || '').trim();
  if (envGitRef && (envGitRefKind === 'tag' || envGitRefKind === 'commit')) {
    return { kind: envGitRefKind, value: envGitRef };
  }

  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return { kind: 'tag', value: process.env.GITHUB_REF_NAME.trim() };
  }

  const exactTag = runGit(['describe', '--tags', '--exact-match']);
  if (exactTag) {
    return { kind: 'tag', value: exactTag };
  }

  const commit =
    (process.env.GIT_COMMIT || '').trim() ||
    runGit(['rev-parse', '--short', 'HEAD']) ||
    'unknown';

  return { kind: 'commit', value: commit };
}

function resolveVersion(pkgVersion) {
  const envVersion = (process.env.APP_BUILD_VERSION || '').trim();
  if (envVersion) {
    return envVersion;
  }

  return String(pkgVersion || '0.0.0').trim();
}

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = resolveVersion(pkg.version);
  const gitRef = resolveGitRef();

  const content =
`export type AppBuildInfo = {
  version: string;
  gitRef: string;
  gitRefKind: 'tag' | 'commit';
};

export const APP_BUILD_INFO: AppBuildInfo = {
  version: ${quote(version)},
  gitRef: ${quote(gitRef.value)},
  gitRefKind: ${quote(gitRef.kind)},
};
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== content) {
    fs.writeFileSync(outputPath, content, 'utf8');
  }
}

main();
