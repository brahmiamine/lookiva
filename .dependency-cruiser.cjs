/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-pure',
      comment:
        'domain may only import from its own module domain and the shared kernel src/platform/kernel (npm packages and node built-ins are fine)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { path: '^src/', pathNot: ['^src/modules/$1/domain/', '^src/platform/kernel/'] },
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
      name: 'external-module-public-only',
      comment:
        'every file outside src/modules (app, ui, worker, platform, i18n, root files...) may only import a module through src/modules/<m>/index.ts',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/modules/', '\\.(test|spec)\\.[cm]?[jt]sx?$'] },
      to: { path: '^src/modules/[^/]+/', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'kernel-pure',
      comment: 'the shared kernel may not import the rest of src (otherwise domain could reach platform code through it)',
      severity: 'error',
      from: { path: '^src/platform/kernel/' },
      to: { path: '^src/', pathNot: '^src/platform/kernel/' },
    },
    {
      name: 'platform-no-modules',
      comment: 'src/platform (kernel included) is below the modules and must not import them at all',
      severity: 'error',
      from: { path: '^src/platform/', pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
      to: { path: '^src/modules/' },
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
