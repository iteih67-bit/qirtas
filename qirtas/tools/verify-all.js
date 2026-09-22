// verify-all.js — one reproducible command that runs every suite and records the result.
//   node tools/verify-all.js [--base=http://localhost:8081/qirtas] [--app-base=http://localhost:8090]
// Writes cache/verify-summary.json and exits non-zero if any suite fails.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const Q = path.resolve(__dirname, '..');
const CACHE = path.join(Q, 'cache');
fs.mkdirSync(CACHE, { recursive: true });

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE = argOf('base', 'http://localhost:8081/qirtas').replace(/\/$/, '');
const APP_BASE = argOf('app-base', 'http://localhost:8090').replace(/\/$/, '');

const suites = [
  { id: 'unit', label: 'اختبارات الوحدة للدوال النقية', args: ['tools/unit-tests.js'], base: false },
  { id: 'integrity', label: 'تدقيق الطبقات (بيانات ↔ كتالوج ↔ صفحات ↔ EPUB)', args: ['tools/integrity-check.js'], base: false, noWarnings: true },
  { id: 'smoke', label: 'فحص البنية والروابط', args: ['tools/smoke-test.js'], base: true },
  { id: 'ui', label: 'واجهة بمتصفح حقيقي (تنقّل، بحث، حالات فشل)', args: ['tools/cdp-check.js'], base: true, retryOnFail: true },
  { id: 'widths', label: 'المقاسات 320→1440', args: ['tools/width-check.js'], base: true, retryOnFail: true },
  { id: 'live', label: 'تدقيق تفاعلي شامل + موارد مفقودة', args: ['tools/live-audit.js'], base: true, retryOnFail: true },
  { id: 'clicks', label: 'كل رابط داخلي (زحف)', args: ['tools/click-audit.js', '--limit=900'], base: true, retryOnFail: true },
];

function reachableSync(url) {
  const { spawnSync } = require('child_process');
  const u = new URL(url);
  const args = ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-I', '--max-time', '3', url];
  const r = spawnSync('curl', args, { encoding: 'utf8' });
  if (r.status === 0 && /\s2\d\d\s/.test(String(r.stdout))) return true;
  return false;
}

const results = [];
for (const s of suites) {
  const args = [path.join(Q, s.args[0]), ...s.args.slice(1)];
  if (s.base) args.push(`--base=${BASE}`);
  const started = Date.now();
  process.stdout.write('▶ ' + s.label + ' … ');
  let r = spawnSync(process.execPath, [...(s.noWarnings ? ['--no-warnings'] : []), ...args], { cwd: Q, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let retried = false;
  if (r.status !== 0 && s.retryOnFail) {
    process.stdout.write('retry … ');
    r = spawnSync(process.execPath, [...(s.noWarnings ? ['--no-warnings'] : []), ...args], { cwd: Q, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    retried = true;
  }
  const ms = Date.now() - started;
  const ok = r.status === 0;
  const tail = String((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 240);
  results.push({ id: s.id, label: s.label, exit: r.status, ok, ms, retried, tail });
  console.log((ok ? 'ok' : 'FAILED') + ' (' + ms + 'ms)');
  if (!ok) console.log('   ' + tail);
}

// the app is a separate artifact: run its suite when it is being served
function reachable(url) {
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'HEAD', timeout: 2500 }, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

let appResult = null;
if (reachableSync(APP_BASE + '/')) {
  process.stdout.write('▶ التطبيق (PWA) بمتصفح حقيقي … ');
  const r = spawnSync(process.execPath, [path.join(Q, 'tools', 'app-audit.js'), `--base=${APP_BASE}`], { cwd: Q, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  appResult = { id: 'app', label: 'التطبيق (PWA) بمتصفح حقيقي', exit: r.status, ok: r.status === 0, ms: 0, tail: String((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-2).join(' | ').slice(0, 200) };
  console.log(appResult.ok ? 'ok' : 'FAILED');
  if (!appResult.ok) console.log('   ' + appResult.tail);
} else {
  console.log('▶ التطبيق: غير مخدوم على ' + APP_BASE + ' — تُخطّى هذه المجموعة');
}

const all = [...results, ...(appResult ? [appResult] : [])];
const failed = all.filter((r) => !r.ok);
const summary = {
  when: new Date().toISOString(),
  base: BASE,
  appBase: appResult ? APP_BASE : null,
  total: all.length,
  passed: all.length - failed.length,
  failed: failed.length,
  suites: all,
};
fs.writeFileSync(path.join(CACHE, 'verify-summary.json'), JSON.stringify(summary, null, 2));

console.log('\n' + '='.repeat(64));
for (const r of all) console.log((r.ok ? '✔' : '✘') + '  ' + r.label.padEnd(52) + r.exit);
console.log('='.repeat(64));
console.log('المجموعات: ' + all.length + ' | ناجحة: ' + summary.passed + ' | فاشلة: ' + summary.failed + '  →  cache/verify-summary.json');
process.exit(failed.length ? 1 : 0);
