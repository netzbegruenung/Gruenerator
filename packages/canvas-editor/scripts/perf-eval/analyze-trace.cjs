#!/usr/bin/env node
// Usage: node analyze-trace.js [trace.json.gz] [--json out.json]
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'trace-baseline.json.gz');
const raw = fs.readFileSync(file);
const ev = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString()).traceEvents;

const threadNames = new Map();
for (const e of ev) if (e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args.name);

const marks = ev.filter((e) => e.name && e.name.startsWith('scn:') && (e.cat || '').includes('blink.user_timing'));
const mainKey = marks.length ? `${marks[0].pid}:${marks[0].tid}` : [...threadNames].find(([, n]) => n === 'CrRendererMain')[0];
const [PID, TID] = mainKey.split(':').map(Number);
const mark = Object.fromEntries(marks.map((m) => [m.name, m.ts]));

function phaseOf(ts) {
  if (mark['scn:end'] && ts >= mark['scn:end']) return 'after-end';
  if (mark['scn:dragend'] && ts >= mark['scn:dragend']) return 'after-dragend';
  if (mark['scn:drag'] && ts >= mark['scn:drag']) return 'drag';
  if (mark['scn:select'] && ts >= mark['scn:select']) return 'select';
  return 'pre-select';
}
function rel(ts) {
  const order = ['scn:select', 'scn:drag', 'scn:dragend', 'scn:end'];
  let best = null;
  for (const k of order) if (mark[k] && ts >= mark[k]) best = k;
  return best ? `${best}+${((ts - mark[best]) / 1000).toFixed(0)}ms` : `scn:select${((ts - mark['scn:select']) / 1000).toFixed(0)}ms`;
}

// ---- CPU profile for main thread ----
const profEv = ev.find((e) => e.name === 'Profile' && e.pid === PID && e.tid === TID);
const profId = profEv.id;
const nodes = new Map();
let samples = [];
let t = profEv.args.data.startTime;
for (const e of ev) {
  if (e.name !== 'ProfileChunk' || e.pid !== PID || e.id !== profId) continue;
  const d = e.args.data;
  const cp = d.cpuProfile || {};
  for (const n of cp.nodes || []) nodes.set(n.id, { ...n, children: [] });
  const s = cp.samples || [];
  const td = d.timeDeltas || [];
  for (let i = 0; i < s.length; i++) {
    t += td[i] || 0;
    samples.push({ ts: t, node: s[i], line: d.lines ? d.lines[i] : undefined });
  }
}
samples.sort((a, b) => a.ts - b.ts);
for (let i = 0; i < samples.length; i++) {
  samples[i].dur = i + 1 < samples.length ? Math.min(samples[i + 1].ts - samples[i].ts, 10000) : 0;
}

const ROOT = process.env.REPO || process.cwd();
function shortUrl(url) {
  if (!url) return '';
  let u = url.replace(/^https?:\/\/localhost:\d+/, '').replace(/\?.*$/, '');
  u = u.replace(/^\/@fs/, '');
  u = u.replace(ROOT + '/', '');
  u = u.replace(/.*\/node_modules\/\.vite\/deps\//, 'deps/');
  return u;
}
function frameKey(n) {
  const cf = n.callFrame;
  const fn = cf.functionName || '(anonymous)';
  if (!cf.url) return fn;
  return `${fn} @ ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;
}
const APP_RE = /packages\/canvas-editor\/src\//;
function category(n) {
  const cf = n.callFrame;
  const fn = cf.functionName;
  const u = cf.url || '';
  if (fn === '(garbage collector)') return 'GC';
  if (fn === '(idle)') return 'idle';
  if (fn === '(program)') return 'program(native/blink)';
  if (fn === '(root)') return 'root';
  if (/react-scan/.test(u)) return 'react-scan';
  if (fn === 'toDataURL' || fn === 'toBlob' || fn === 'getImageData' || fn === 'drawImage' && !u) return 'canvas encode/drawImage';
  if (/^(stringify|parse)$/.test(fn) && !u) return 'JSON.stringify/parse';
  if (!u && (fn === 'createTask' || fn === 'run')) return 'react-dev (console.createTask/task.run)';
  if (/konva|\/deps\/lib-Chm-KaFm\.js/i.test(u)) return 'konva';
  if (/react-dom|scheduler|react_jsx|react\.js|chunk-.*react/i.test(u)) return 'react-dom';
  if (/yjs|y-protocols|lib0|hocuspocus|y-indexeddb/i.test(u)) return 'yjs/collab-lib';
  if (APP_RE.test(u)) return 'app:' + shortUrl(u).replace(/^.*packages\/canvas-editor\/src\//, '');
  if (!u) return 'native:' + (fn || '?');
  return 'other:' + shortUrl(u).split('/').slice(-1)[0];
}
for (const n of nodes.values()) if (n.parent) nodes.get(n.parent)?.children.push(n.id);
function stack(id) {
  const out = [];
  let n = nodes.get(id);
  while (n) {
    out.push(n);
    n = n.parent ? nodes.get(n.parent) : null;
  }
  return out; // leaf first
}
const stackCache = new Map();
function getStack(id) {
  if (!stackCache.has(id)) stackCache.set(id, stack(id));
  return stackCache.get(id);
}

// Root-cause triggers: first matching rule walking from leaf to root (most specific app frame wins).
const TRIGGERS = [
  [/react-scan/, 'react-scan overhead'],
  [/usePageThumbnails|generateThumbnail|thumbnail/i, 'page thumbnails'],
  [/captureSnapshot|autosave|autoSave|useAutoSave|scheduleSave/i, 'autosave capture'],
  [/saveToHistory|pushHistory|addToHistory|useHistory|history/i, 'history save'],
  [/pagesDoc|writeBack|writePages|syncToY|applyToY/i, 'Yjs write-back'],
  [/onLiveState|liveState/i, 'onLiveState rerender'],
  [/measureText|textUtils|wrapText|measure/i, 'text measurement'],
];
function triggerOf(st) {
  for (const n of st) {
    if (!APP_RE.test(n.callFrame.url || '')) continue;
    const s = n.callFrame.functionName + ' ' + n.callFrame.url;
    for (const [re, name] of TRIGGERS) if (re.test(s)) return name;
  }
  if (st.some((n) => /react-scan/.test(n.callFrame.url || ''))) return 'react-scan overhead';
  return null;
}
function nearestApp(st) {
  for (const n of st) if (APP_RE.test(n.callFrame.url || '')) return frameKey(n);
  return null;
}

// ---- trace-event categories within main thread ----
const mainEv = ev.filter((e) => e.pid === PID && e.tid === TID && e.ph === 'X');
const LAYOUT_NAMES = new Set(['Layout', 'UpdateLayoutTree', 'RecalculateStyles', 'Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'HitTest', 'IntersectionObserverController::computeIntersections']);
const GC_NAMES = new Set(['MinorGC', 'MajorGC', 'V8.GCScavenger', 'V8.GCFinalizeMC', 'BlinkGC.AtomicPhase', 'CppGC.AtomicMark']);

const tasks = mainEv
  .filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur > 50000)
  .sort((a, b) => a.ts - b.ts);

function add(map, k, v) {
  map.set(k, (map.get(k) || 0) + v);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const ms = (us) => (us / 1000).toFixed(1);

const global = { cat: new Map(), app: new Map(), appIncl: new Map(), trig: new Map(), self: new Map() };
const results = [];
let si = 0;
for (const task of tasks) {
  const end = task.ts + task.dur;
  const self = new Map(), cat = new Map(), app = new Map(), appIncl = new Map(), trig = new Map();
  while (si < samples.length && samples[si].ts < task.ts) si++;
  for (let j = si; j < samples.length && samples[j].ts < end; j++) {
    const s = samples[j];
    const st = getStack(s.node);
    const leaf = st[0];
    const k = frameKey(leaf);
    const c = category(leaf);
    add(self, k, s.dur);
    add(cat, c, s.dur);
    if (c.startsWith('app:')) add(app, k, s.dur);
    const na = nearestApp(st);
    if (na) add(appIncl, na, s.dur);
    const tr = triggerOf(st) || (c.startsWith('app:') ? 'other app' : c.split(':')[0]);
    add(trig, tr, s.dur);
  }
  const layout = new Map();
  for (const e of mainEv) {
    if (e.ts < task.ts || e.ts >= end) continue;
    if (LAYOUT_NAMES.has(e.name)) add(layout, e.name, e.dur);
    if (GC_NAMES.has(e.name)) add(layout, 'traceGC:' + e.name, e.dur);
  }
  // innermost interesting trace event names (FunctionCall/TimerFire/EventDispatch/FireAnimationFrame) for context
  const kinds = new Map();
  for (const e of mainEv) {
    if (e.ts < task.ts || e.ts >= end) continue;
    if (['TimerFire', 'FireAnimationFrame', 'EventDispatch', 'FunctionCall', 'RunMicrotasks', 'FireIdleCallback', 'v8.callFunction'].includes(e.name)) {
      const d = e.args?.data || {};
      const label = e.name + (d.type ? `(${d.type})` : '') + (d.functionName ? `(${d.functionName})` : '') + (d.url && e.name === 'FunctionCall' ? `[${shortUrl(d.url).split('/').pop()}:${d.lineNumber}]` : '');
      add(kinds, label, e.dur);
    }
  }
  for (const [k, v] of self) add(global.self, k, v);
  for (const [k, v] of cat) add(global.cat, k, v);
  for (const [k, v] of app) add(global.app, k, v);
  for (const [k, v] of appIncl) add(global.appIncl, k, v);
  for (const [k, v] of trig) add(global.trig, k, v);
  results.push({ ts: task.ts, rel: rel(task.ts), phase: phaseOf(task.ts), dur: task.dur, self, cat, app, appIncl, trig, layout, kinds });
}

// ---- output ----
console.log(`main thread ${mainKey} (${threadNames.get(mainKey)}), samples=${samples.length}, marks:`, Object.fromEntries(Object.entries(mark).map(([k, v]) => [k, ms(v - mark['scn:select'])])));
console.log(`\n${tasks.length} long tasks (>50ms)\n`);
for (const r of results) {
  console.log(`=== ${r.rel} [${r.phase}] dur=${ms(r.dur)}ms`);
  console.log('  events:', top(r.kinds, 4).map(([k, v]) => `${k} ${ms(v)}`).join(' | '));
  console.log('  self  :', top(r.self, 6).map(([k, v]) => `${k} ${ms(v)}`).join('\n          '));
  console.log('  cat   :', top(r.cat, 8).map(([k, v]) => `${k} ${ms(v)}`).join(' | '));
  console.log('  trig  :', top(r.trig, 6).map(([k, v]) => `${k} ${ms(v)}`).join(' | '));
  console.log('  appIncl:', top(r.appIncl, 6).map(([k, v]) => `${k} ${ms(v)}`).join('\n          '));
  if (r.layout.size) console.log('  layout:', top(r.layout, 5).map(([k, v]) => `${k} ${ms(v)}`).join(' | '));
}
console.log('\n=== TOTAL over long tasks:', ms(results.reduce((a, r) => a + r.dur, 0)), 'ms');
console.log('categories:\n ', top(global.cat, 25).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
console.log('triggers:\n ', top(global.trig, 20).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
console.log('app self:\n ', top(global.app, 25).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
console.log('app nearest-frame (incl. callees in libs):\n ', top(global.appIncl, 30).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
console.log('self overall:\n ', top(global.self, 30).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));

// ---- whole scenario window (scn:select-1100ms .. scn:end), all samples, not only long tasks ----
{
  const from = mark['scn:select'] - 1100e3, to = mark['scn:end'];
  const cat = new Map(), trig = new Map();
  for (const s of samples) {
    if (s.ts < from || s.ts >= to) continue;
    const st = getStack(s.node);
    const c = category(st[0]);
    add(cat, c, s.dur);
    add(trig, triggerOf(st) || (c.startsWith('app:') ? 'other app' : c.split(':')[0]), s.dur);
  }
  console.log(`\n=== WHOLE WINDOW scn:select-1100ms..scn:end (${ms(to - from)}ms wall), all main-thread samples`);
  console.log('categories:\n ', top(cat, 20).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
  console.log('triggers:\n ', top(trig, 15).map(([k, v]) => `${k} ${ms(v)}`).join('\n  '));
}

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > 0) {
  const toObj = (m) => Object.fromEntries(top(m, 50).map(([k, v]) => [k, +ms(v)]));
  fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(results.map((r) => ({ ...r, self: toObj(r.self), cat: toObj(r.cat), app: toObj(r.app), appIncl: toObj(r.appIncl), trig: toObj(r.trig), layout: toObj(r.layout), kinds: toObj(r.kinds) })), null, 1));
}
