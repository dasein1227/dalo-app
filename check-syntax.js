// check-syntax.js
const fg = require('fast-glob');
const fs = require('fs');
const parser = require('@babel/parser');

(async () => {
  const files = await fg(
    [
      '**/*.{ts,tsx,js,jsx}',
      '!node_modules/**',
      '!android/**',
      '!ios/**',
      '!.expo/**',
      '!supabase/**',      // Deno 함수는 제외 (앱이 아님)
    ],
    { dot: false }
  );

  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    try {
      parser.parse(code, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'decorators-legacy',
          'importAssertions',
          'dynamicImport',
          // 필요 시 추가
        ],
      });
    } catch (e) {
      console.error(`\n✖ Syntax error in ${f}:${e.loc?.line ?? '?'}:${e.loc?.column ?? '?'}`);
      console.error(e.message);
      process.exit(1);
    }
  }
  console.log('✅ No parse errors (project-wide).');
})();
