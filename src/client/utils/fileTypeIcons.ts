const EXTENSION_ICON_MAP: Record<string, string> = {
  ts: 'vscode-icons:file-type-typescript',
  tsx: 'vscode-icons:file-type-reactts',
  mts: 'vscode-icons:file-type-typescript',
  cts: 'vscode-icons:file-type-typescript',
  d: 'vscode-icons:file-type-typescript',
  js: 'vscode-icons:file-type-js',
  jsx: 'vscode-icons:file-type-reactjs',
  mjs: 'vscode-icons:file-type-js',
  cjs: 'vscode-icons:file-type-js',
  json: 'vscode-icons:file-type-json',
  jsonc: 'vscode-icons:file-type-json',
  yaml: 'vscode-icons:file-type-yaml',
  yml: 'vscode-icons:file-type-yaml',
  toml: 'vscode-icons:file-type-toml',
  md: 'vscode-icons:file-type-markdown',
  mdx: 'vscode-icons:file-type-mdx',
  html: 'vscode-icons:file-type-html',
  htm: 'vscode-icons:file-type-html',
  css: 'vscode-icons:file-type-css',
  scss: 'vscode-icons:file-type-scss',
  sass: 'vscode-icons:file-type-sass',
  less: 'vscode-icons:file-type-less',
  vue: 'vscode-icons:file-type-vue',
  svelte: 'vscode-icons:file-type-svelte',
  py: 'vscode-icons:file-type-python',
  rb: 'vscode-icons:file-type-ruby',
  go: 'vscode-icons:file-type-go',
  rs: 'vscode-icons:file-type-rust',
  java: 'vscode-icons:file-type-java',
  kt: 'vscode-icons:file-type-kotlin',
  swift: 'vscode-icons:file-type-swift',
  php: 'vscode-icons:file-type-php',
  c: 'vscode-icons:file-type-c',
  h: 'vscode-icons:file-type-cheader',
  cpp: 'vscode-icons:file-type-cpp',
  hpp: 'vscode-icons:file-type-cppheader',
  cc: 'vscode-icons:file-type-cpp',
  cs: 'vscode-icons:file-type-csharp',
  sh: 'vscode-icons:file-type-shell',
  bash: 'vscode-icons:file-type-shell',
  zsh: 'vscode-icons:file-type-shell',
  fish: 'vscode-icons:file-type-shell',
  sql: 'vscode-icons:file-type-sql',
  svg: 'vscode-icons:file-type-svg',
  png: 'vscode-icons:file-type-image',
  jpg: 'vscode-icons:file-type-image',
  jpeg: 'vscode-icons:file-type-image',
  gif: 'vscode-icons:file-type-image',
  webp: 'vscode-icons:file-type-image',
  ico: 'vscode-icons:file-type-image',
  bmp: 'vscode-icons:file-type-image',
  avif: 'vscode-icons:file-type-image',
  lock: 'vscode-icons:file-type-text',
  log: 'vscode-icons:file-type-log',
  txt: 'vscode-icons:file-type-text',
  xml: 'vscode-icons:file-type-xml',
  graphql: 'vscode-icons:file-type-graphql',
  gql: 'vscode-icons:file-type-graphql',
  proto: 'vscode-icons:file-type-protobuf',
  env: 'vscode-icons:file-type-dotenv',
  editorconfig: 'vscode-icons:file-type-editorconfig',
  prettierrc: 'vscode-icons:file-type-prettier',
  eslintrc: 'vscode-icons:file-type-eslint',
  gitignore: 'vscode-icons:file-type-git',
  gitattributes: 'vscode-icons:file-type-git',
  dockerignore: 'vscode-icons:file-type-docker2',
  npmignore: 'vscode-icons:file-type-npm',
  pdf: 'vscode-icons:file-type-pdf2',
  zip: 'vscode-icons:file-type-zip',
  tar: 'vscode-icons:file-type-zip',
  gz: 'vscode-icons:file-type-zip',
};

const FILENAME_ICON_MAP: Record<string, string> = {
  'package.json': 'vscode-icons:file-type-npm',
  'package-lock.json': 'vscode-icons:file-type-npm',
  '.npmrc': 'vscode-icons:file-type-npm',
  'pnpm-lock.yaml': 'vscode-icons:file-type-pnpm',
  'pnpm-workspace.yaml': 'vscode-icons:file-type-pnpm',
  '.pnpmfile.cjs': 'vscode-icons:file-type-pnpm',
  'yarn.lock': 'vscode-icons:file-type-yarn',
  '.yarnrc': 'vscode-icons:file-type-yarn',
  'bun.lockb': 'vscode-icons:file-type-bun',
  dockerfile: 'vscode-icons:file-type-docker2',
  'docker-compose.yml': 'vscode-icons:file-type-docker2',
  'docker-compose.yaml': 'vscode-icons:file-type-docker2',
  '.gitignore': 'vscode-icons:file-type-git',
  '.gitattributes': 'vscode-icons:file-type-git',
  '.gitmodules': 'vscode-icons:file-type-git',
  '.env': 'vscode-icons:file-type-dotenv',
  '.env.local': 'vscode-icons:file-type-dotenv',
  '.env.development': 'vscode-icons:file-type-dotenv',
  '.env.production': 'vscode-icons:file-type-dotenv',
  '.env.test': 'vscode-icons:file-type-dotenv',
  '.editorconfig': 'vscode-icons:file-type-editorconfig',
  '.prettierrc': 'vscode-icons:file-type-prettier',
  '.prettierrc.json': 'vscode-icons:file-type-prettier',
  '.prettierrc.js': 'vscode-icons:file-type-prettier',
  'prettier.config.js': 'vscode-icons:file-type-prettier',
  '.eslintrc': 'vscode-icons:file-type-eslint',
  '.eslintrc.js': 'vscode-icons:file-type-eslint',
  '.eslintrc.json': 'vscode-icons:file-type-eslint',
  '.eslintrc.cjs': 'vscode-icons:file-type-eslint',
  'eslint.config.js': 'vscode-icons:file-type-eslint',
  'eslint.config.cjs': 'vscode-icons:file-type-eslint',
  'eslint.config.mjs': 'vscode-icons:file-type-eslint',
  'eslint.config.ts': 'vscode-icons:file-type-eslint',
  'tsconfig.json': 'vscode-icons:file-type-tsconfig',
  'jsconfig.json': 'vscode-icons:file-type-jsconfig',
  'vite.config.ts': 'vscode-icons:file-type-vite',
  'vite.config.js': 'vscode-icons:file-type-vite',
  'vite.config.mts': 'vscode-icons:file-type-vite',
  'vite.config.mjs': 'vscode-icons:file-type-vite',
  'vitest.config.ts': 'vscode-icons:file-type-vitest',
  'vitest.config.js': 'vscode-icons:file-type-vitest',
  'jest.config.js': 'vscode-icons:file-type-jest',
  'jest.config.ts': 'vscode-icons:file-type-jest',
  'playwright.config.ts': 'vscode-icons:file-type-playwright',
  'playwright.config.js': 'vscode-icons:file-type-playwright',
  'webpack.config.js': 'vscode-icons:file-type-webpack',
  'webpack.config.ts': 'vscode-icons:file-type-webpack',
  'rollup.config.js': 'vscode-icons:file-type-rollup',
  'rollup.config.ts': 'vscode-icons:file-type-rollup',
  'tailwind.config.js': 'vscode-icons:file-type-tailwind',
  'tailwind.config.ts': 'vscode-icons:file-type-tailwind',
  'postcss.config.js': 'vscode-icons:file-type-postcss',
  'readme.md': 'vscode-icons:file-type-markdown',
  license: 'vscode-icons:file-type-license',
  'license.md': 'vscode-icons:file-type-license',
  'changelog.md': 'vscode-icons:file-type-markdown',
  makefile: 'vscode-icons:file-type-makefile',
  'lefthook.yml': 'vscode-icons:file-type-lefthook',
  'lefthook.yaml': 'vscode-icons:file-type-lefthook',
};

const TEST_ICON_BY_KIND: Record<string, string> = {
  ts: 'vscode-icons:file-type-testts',
  tsx: 'vscode-icons:file-type-testts',
  mts: 'vscode-icons:file-type-testts',
  cts: 'vscode-icons:file-type-testts',
  js: 'vscode-icons:file-type-testjs',
  jsx: 'vscode-icons:file-type-testjs',
  mjs: 'vscode-icons:file-type-testjs',
  cjs: 'vscode-icons:file-type-testjs',
};

const DEFAULT_FILE_ICON = 'vscode-icons:default-file';

export function getFileTypeIconName(filepath: string): string {
  const basename = filepath.split('/').pop() ?? filepath;
  const lower = basename.toLowerCase();

  const testMatch = lower.match(/\.(test|spec)\.([cm]?[jt]sx?)$/);
  const testKind = testMatch?.[2];
  if (testKind) {
    const iconName = TEST_ICON_BY_KIND[testKind];
    if (iconName) return iconName;
  }

  const filenameIcon = FILENAME_ICON_MAP[lower];
  if (filenameIcon) return filenameIcon;

  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex > 0) {
    const ext = basename.slice(dotIndex + 1).toLowerCase();
    const extIcon = EXTENSION_ICON_MAP[ext];
    if (extIcon) return extIcon;
  }

  return DEFAULT_FILE_ICON;
}
