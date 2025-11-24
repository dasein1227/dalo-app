// find-bundle-source.js
const http = require('http');

const BUNDLE_URL =
  process.env.BUNDLE_URL ||
  'http://192.168.0.124:8081/index.bundle?platform=android&dev=true&minify=false';

const TARGET_LINE = Number(process.env.TARGET_LINE || 367890); // 에러 라인 번호
const WINDOW = 12; // 주변 라인 몇 개 볼지

http
  .get(BUNDLE_URL, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      const lines = data.split('\n');
      const start = Math.max(0, TARGET_LINE - WINDOW);
      const end = Math.min(lines.length - 1, TARGET_LINE + WINDOW);

      console.log(`\n=== Lines ${start}..${end} (around ${TARGET_LINE}) ===\n`);
      for (let i = start; i <= end; i++) {
        const mark = i === TARGET_LINE ? '>>' : '  ';
        console.log(`${mark} ${i}: ${lines[i] || ''}`);
      }

      // 모듈 경계의 sourceURL 혹은 __d() 패턴 찾기
      const windowText = lines.slice(start, end + 1).join('\n');
      const m1 = windowText.match(/sourceURL=([^\s"']+)/); // //# sourceURL=src/...
      const m2 = windowText.match(/"src[\\/][^"]+\.(ts|tsx|js|jsx)"/); // __d(...,"src\path\file.tsx")
      console.log('\n=== Guess ===');
      if (m1) console.log('sourceURL:', m1[1]);
      if (m2) console.log('module path:', m2[0].replace(/"/g, ''));
      if (!m1 && !m2)
        console.log(
          '⚠️  원본 경로 힌트를 못 찾음. TARGET_LINE을 ±500 정도 바꿔 다시 실행하세요.'
        );
    });
  })
  .on('error', (e) => {
    console.error('HTTP error:', e.message);
    console.error('BUNDLE_URL이 맞는지 확인하세요 (Metro가 켜져 있어야 함).');
  });
