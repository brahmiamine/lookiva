/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-pure',
      comment: 'domain may only import from its own module domain (npm packages and node built-ins are fine)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { path: '^src/', pathNot: '^src/modules/$1/domain/' },
    },
    {
      name: 'no-infra-from-inner',
      comment: 'domain and application must not depend on infrastructure (it implements their ports)',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(domain|application)/' },
      to: { path: '^src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'module-public-only',
      comment: 'a module may only be imported through src/modules/<m>/index.ts',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'ui-no-infra',
      comment: 'src/app and src/ui must not import infrastructure',
      severity: 'error',
      from: { path: '^src/(app|ui)/' },
      to: { path: '^src/modules/[^/]+/infrastructure/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/generated/' },
    tsPreCompilationDeps: true,
  },
};
