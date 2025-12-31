module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    ['@semantic-release/npm', { npmPublish: false }],
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'package.json',
               'apps/web/package.json',
               'apps/api/package.json'],
      message: 'chore(release): ${nextRelease.version} [skip ci]'
    }],
    '@semantic-release/github'
  ]
};
