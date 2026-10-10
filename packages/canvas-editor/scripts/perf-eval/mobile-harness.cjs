// Mobile canvas-editor harness: real CDP touch input, iPhone-like viewport, CPU throttle.
// usage: node mobile-harness.cjs <url> <throttle> [scenario,...]
const { chromium } = require(process.env.PW_CORE);
const url = process.argv[2];
const RATE = Number(process.argv[3] || 4);
const only = (process.argv[4] || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = () => {
  window.__bridge = [];
  window.ReactNativeWebView = { postMessage: (m) => { try { const o = JSON.parse(m); if (o && o.data && o.data.length > 200) o.data = '<' + o.data.length + ' chars>'; window.__bridge.push(o); } catch { window.__bridge.push(String(m).slice(0, 200)); } } };
  window.__lt = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__frames = null;
  window.__startFrames = () => { window.__frames = []; let last = performance.now(); const tick = (t) => { if (!window.__frames) return; window.__frames.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__ltMark = window.__lt.length; };
  window.__stopFrames = () => { const f = window.__frames || []; window.__frames = null; const lt = window.__lt.slice(window.__ltMark); const s = [...f].sort((a, b) => a - b); return { frames: f.length, over33: f.filter((x) => x > 33.4).length, over50: f.filter((x) => x > 50).length, max: Math.round(s[s.length - 1] || 0), p95: Math.round(s[Math.floor(s.length * 0.95)] || 0), longTasks: lt.length, ltMax: Math.max(0, ...lt.map((x) => x[1])), ltSum: lt.reduce((a, b) => a + b[1], 0) }; };
};

// Client rect (CSS px, viewport) of draggable nodes on the first visible stage.
const nodesJs = () => {
  const out = [];
  window.Konva.stages.forEach((st, si) => {
    const r = st.container().getBoundingClientRect();
    const k = r.width / st.width();
    st.find((n) => n.draggable && n.draggable() && n.isVisible()).forEach((n) => {
      const c = n.getClientRect();
      out.push({ si, id: n.id() || n.name(), cls: n.getClassName(), x: r.left + (c.x + c.width / 2) * k, y: r.top + (c.y + c.height / 2) * k, w: c.width * k, h: c.height * k, abs: n.absolutePosition() });
    });
  });
  return out;
};

(async () => {
  const remote = process.env.CDP;
  const browser = remote ? await chromium.connectOverCDP(remote) : await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=430,900'] });
  const ctx = remote ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.addInitScript(INIT);
  const p = remote ? ctx.pages().find((x) => x.url().includes('/studio/canvas')) : await ctx.newPage();
  if (remote) await (await ctx.newCDPSession(p)).send('Network.setBlockedURLs', { urls: ['*react-scan*'] }).catch(() => {});
  const cdp = await ctx.newCDPSession(p);
  if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  if (remote) await cdp.send('Network.setBlockedURLs', { urls: ['*react-scan*'] });
  const R = {};
  const run = (name) => !only.length || only.includes(name);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const measure = async (name, fn) => { await p.evaluate(() => window.__startFrames()); const extra = await fn(); await sleep(300); R[name] = { ...(await p.evaluate(() => window.__stopFrames())), ...(extra || {}) }; };

  const t0 = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => window.Konva?.stages?.length >= 1 && document.querySelector('.konvajs-content'), null, { timeout: 90000 });
  R.load = { msToFirstStage: Date.now() - t0 };
  await sleep(5000);
  R.load = { ...R.load, ...(await p.evaluate(() => ({ longTasks: window.__lt.length, ltSum: window.__lt.reduce((a, b) => a + b[1], 0), ltMax: Math.max(0, ...window.__lt.map((x) => x[1])), stages: window.Konva.stages.length, canvasMPx: +([...document.querySelectorAll('canvas')].reduce((a, c) => a + c.width * c.height, 0) / 1e6).toFixed(1), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0) }))) };

  const scroller = await p.evaluate(() => { const c = document.querySelector('.konvajs-content'); let e = c.parentElement; while (e && e !== document.body) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return { tag: e.tagName, cls: e.className.slice(0, 60), sh: e.scrollHeight, ch: e.clientHeight }; e = e.parentElement; } return null; });
  R.scroller = scroller;
  const scrollTop = () => p.evaluate(() => { const c = document.querySelector('.konvajs-content'); let e = c.parentElement; while (e && e !== document.body) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return Math.round(e.scrollTop); e = e.parentElement; } return Math.round(window.scrollY); });
  const selected = () => p.evaluate(() => window.Konva.stages.flatMap((s) => s.find('Transformer')).filter((t) => t.isVisible() && t.nodes().length).map((t) => t.nodes().map((n) => n.id() || n.getClassName()).join('+')));

  // 1. Touch scroll through the deck starting on the page gutter (outside stages).
  if (run('scroll')) {
    await measure('scrollGutter', async () => {
      const before = await scrollTop();
      for (let i = 0; i < 3; i++) await cdp.send('Input.synthesizeScrollGesture', { x: 8, y: 700, yDistance: -500, gestureSourceType: 'touch', speed: 1200 });
      return { scrolled: (await scrollTop()) - before };
    });
    // back up
    for (let i = 0; i < 3; i++) await cdp.send('Input.synthesizeScrollGesture', { x: 8, y: 200, yDistance: 500, gestureSourceType: 'touch', speed: 3000 });
    await sleep(500);
  }

  // 2. Touch scroll starting ON the canvas (empty bg) and ON an element — does the page scroll, does it select?
  if (run('scrollOnCanvas')) {
    const nodes = await p.evaluate(nodesJs);
    const st = await p.evaluate(() => { const r = window.Konva.stages[0].container().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 20, top: r.top, bottom: r.bottom }; });
    await measure('scrollOnCanvasBg', async () => {
      const before = await scrollTop();
      await cdp.send('Input.synthesizeScrollGesture', { x: 20, y: Math.min(st.bottom - 10, 780), yDistance: -300, gestureSourceType: 'touch', speed: 1200 });
      await sleep(300);
      return { scrolled: (await scrollTop()) - before, selected: await selected() };
    });
    for (let i = 0; i < 2; i++) await cdp.send('Input.synthesizeScrollGesture', { x: 8, y: 200, yDistance: 600, gestureSourceType: 'touch', speed: 3000 });
    await sleep(500);
    const n = (await p.evaluate(nodesJs)).find((q) => q.si === 0 && q.y > 150 && q.y < 750 && q.cls !== 'Rect');
    if (n) {
      const absBefore = n.abs;
      await measure('scrollStartingOnElement', async () => {
        const before = await scrollTop();
        await cdp.send('Input.synthesizeScrollGesture', { x: n.x, y: n.y, yDistance: -250, gestureSourceType: 'touch', speed: 800 });
        await sleep(400);
        const after = (await p.evaluate(nodesJs)).find((q) => q.id === n.id && q.si === 0);
        return { element: n.cls + ':' + n.id, scrolled: (await scrollTop()) - before, selected: await selected(), elementMovedBy: after ? Math.round(after.abs.y - absBefore.y) : null };
      });
      // undo any accidental move
      await p.evaluate(() => document.activeElement?.blur());
    }
    for (let i = 0; i < 2; i++) await cdp.send('Input.synthesizeScrollGesture', { x: 8, y: 200, yDistance: 600, gestureSourceType: 'touch', speed: 3000 });
    await sleep(500);
  }

  // 3. Tap to select, then touch-drag the element for ~1s.
  if (run('drag')) {
    const n = (await p.evaluate(nodesJs)).find((q) => q.si === 0 && q.y > 200 && q.y < 700 && q.w < 330);
    R.dragTarget = n && { cls: n.cls, id: n.id, x: Math.round(n.x), y: Math.round(n.y) };
    if (n) {
      await touch('touchStart', [[n.x, n.y]]); await touch('touchEnd', []); await sleep(600);
      R.tapSelect = { selected: await selected(), hoverOutlineVisible: await p.evaluate(() => window.Konva.stages.some((s) => s.find('.selection-chrome').some((r) => r.getClassName() === 'Rect' && r.isVisible() && r.getLayer() && !r.findAncestor?.('Transformer')))) };
      if (process.env.TRACE) await browser.startTracing(p, { path: process.env.TRACE, screenshots: false });
      await measure('touchDrag', async () => {
        await touch('touchStart', [[n.x, n.y]]);
        for (let i = 1; i <= 60; i++) { await touch('touchMove', [[n.x + i * 1.5, n.y + i * 1.0]]); await sleep(16); }
        await touch('touchEnd', []);
        await sleep(200);
        const a = (await p.evaluate(nodesJs)).find((q) => q.id === n.id && q.si === 0);
        return { movedCssPx: a ? [Math.round(a.x - n.x), Math.round(a.y - n.y)] : null };
      });
      await measure('afterDrag4s', async () => { await sleep(4000); });
      if (process.env.TRACE) await browser.stopTracing();
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z').catch(() => {});
    }
  }

  // 4. Pinch on the stage: canvas zoom vs. page (visual viewport) zoom.
  if (run('pinch')) {
    const st = await p.evaluate(() => { const r = window.Konva.stages[0].container().getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(200, r.top + r.height / 2) }; });
    const before = await p.evaluate(() => ({ vv: visualViewport.scale, z: getComputedStyle(document.querySelector('[style*="--canvas-zoom"]') || document.body).getPropertyValue('--canvas-zoom') }));
    await measure('pinchOnStage', async () => {
      await cdp.send('Input.synthesizePinchGesture', { x: st.x, y: st.y, scaleFactor: 1.8, relativeSpeed: 400, gestureSourceType: 'touch' });
      await sleep(600);
      return { before, after: await p.evaluate(() => ({ vv: +visualViewport.scale.toFixed(2), z: getComputedStyle(document.querySelector('[style*="--canvas-zoom"]') || document.body).getPropertyValue('--canvas-zoom') })) };
    });
    // pinch on header (outside stage)
    await measure('pinchOnHeader', async () => {
      await cdp.send('Input.synthesizePinchGesture', { x: 200, y: 40, scaleFactor: 1.8, relativeSpeed: 400, gestureSourceType: 'touch' });
      await sleep(600);
      return { after: await p.evaluate(() => ({ vv: +visualViewport.scale.toFixed(2) })) };
    });
  }

  R.bridge = await p.evaluate(() => window.__bridge);
  R.console = [];
  console.log(JSON.stringify(R, null, 1));
  if (remote) process.exit(0);
  if (!process.env.KEEP) await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
