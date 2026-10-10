// Canvas-editor perf harness. Load in page: await import('/@fs/<abs path>/.perf/harness.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stats = { commits: 0, comps: new Map(), on: false };
const compName = (f) => {
  const t = f.type;
  if (!t || typeof t === 'string') return null;
  return (
    t.displayName ||
    t.name ||
    t.render?.displayName ||
    t.render?.name ||
    t.type?.displayName ||
    t.type?.name ||
    null
  );
};
const walk = (f) => {
  while (f) {
    const a = f.alternate;
    const fresh = !a;
    if (fresh || f.flags & 1) {
      const n = compName(f);
      if (n) stats.comps.set(n, (stats.comps.get(n) || 0) + 1);
    }
    if (f.child && (fresh || f.child !== a.child)) walk(f.child);
    f = f.sibling;
  }
};
const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
if (hook && !hook.__perfWrapped) {
  const orig = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = function (id, root, ...rest) {
    if (stats.on) {
      stats.commits++;
      try {
        walk(root.current.child);
      } catch {}
    }
    return orig?.call(this, id, root, ...rest);
  };
  hook.__perfWrapped = true;
}

let longTasks = [];
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) longTasks.push(Math.round(e.duration));
}).observe({ type: 'longtask' });

export const reset = () => {
  stats.commits = 0;
  stats.comps.clear();
  stats.on = true;
  longTasks = [];
};
export const report = (filter, k = 15) => {
  const re = filter ? new RegExp(filter) : null;
  return {
    commits: stats.commits,
    longTasks: [...longTasks],
    longTaskSum: longTasks.reduce((a, b) => a + b, 0),
    renders: [...stats.comps.entries()]
      .filter(([n]) => !re || re.test(n))
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([n, c]) => `${n} ${c}`),
  };
};

export const frames = (ms) =>
  new Promise((res) => {
    const t = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => {
      t.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else {
        const s = [...t].sort((a, b) => a - b);
        res({
          frames: t.length,
          p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
          max: +s[s.length - 1].toFixed(1),
          over33: t.filter((x) => x > 33).length,
        });
      }
    };
    requestAnimationFrame(tick);
  });

const stage = (i = 0) => window.Konva.stages[i];
const center = (st, node) => {
  const r = node.getClientRect();
  const b = st.content.getBoundingClientRect();
  return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
};
const fire = (tg, kind, x, y, buttons) => {
  tg.dispatchEvent(
    new PointerEvent('pointer' + kind, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons,
    })
  );
  tg.dispatchEvent(
    new MouseEvent('mouse' + kind, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
    })
  );
};
export const click = (id, page = 0) => {
  const st = stage(page);
  const p = center(st, st.findOne('#' + id));
  const c = st.content;
  fire(c, 'down', p.x, p.y, 1);
  fire(c, 'up', p.x, p.y, 0);
  fire(window, 'up', p.x, p.y, 0);
};
export const drag = (id, dx, dy, ms, page = 0) =>
  new Promise((res) => {
    const st = stage(page);
    const p = center(st, st.findOne('#' + id));
    const c = st.content;
    fire(c, 'down', p.x, p.y, 1);
    const t0 = performance.now();
    let x = p.x,
      y = p.y;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      x = p.x + dx * Math.sin((k * Math.PI) / 2);
      y = p.y + dy * Math.sin((k * Math.PI) / 2);
      fire(window, 'move', x, y, 1);
      fire(c, 'move', x, y, 1);
      if (k < 1) requestAnimationFrame(step);
      else {
        fire(window, 'up', x, y, 0);
        fire(c, 'up', x, y, 0);
        res();
      }
    };
    requestAnimationFrame(step);
  });

const RENDER_FILTER =
  'CanvasEditor|PageWrapper|GenericCanvas|CanvasRenderLayer|Selectable|Sidebar|Toolbar|Section';

/** (e) idle with selection, (select) click, (a) drag, (after) settle after drag end. */
export async function runScenarios({ textA = 'sc-1-absatz', textB = 'sc-0-headline-0' } = {}) {
  const st0 = stage(0);
  if (!st0.findOne('#' + textA)) textA = 'sc-1-text';
  const out = {};
  click(textA);
  await sleep(1500);
  reset();
  click(textB);
  await sleep(1200);
  out.select = report(RENDER_FILTER);
  reset();
  out.idle = { ...(await frames(6000)), ...report(RENDER_FILTER) };
  reset();
  const fp = frames(2000);
  await drag(textB, 30, 40, 1900);
  out.drag = { ...(await fp), ...report(RENDER_FILTER) };
  reset();
  out.afterDrag = { ...(await frames(6000)), ...report(RENDER_FILTER) };
  // undo the move so repeated runs start from the same place
  await drag(textB, -30, -40, 300);
  await sleep(2500);
  return out;
}
