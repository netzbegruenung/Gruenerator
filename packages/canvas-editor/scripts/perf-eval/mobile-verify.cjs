// Live verification of mobile audit findings. usage: node mobile-verify.cjs <url> <throttle> <scenario,...>
const { chromium } = require(process.env.PW_CORE);
const url = process.argv[2];
const RATE = Number(process.argv[3] || 1);
const scenarios = (process.argv[4] || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOSHARE = !!process.env.NOSHARE;

const INIT = (noShare) => {
  if (noShare) { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch {} }
  window.__bridge = [];
  window.ReactNativeWebView = { postMessage: (m) => { try { const o = JSON.parse(m); for (const k of Object.keys(o)) if (typeof o[k] === 'string' && o[k].length > 300) o[k] = '<' + o[k].length + ' chars>'; window.__bridge.push(o); } catch { window.__bridge.push(String(m).slice(0, 200)); } } };
  window.__lt = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__errors = [];
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandled: ' + String(e.reason?.name || '') + ' ' + String(e.reason?.message || e.reason).slice(0, 200)));
  window.addEventListener('error', (e) => window.__errors.push('error: ' + String(e.message).slice(0, 200)));
};

const nodesJs = () => {
  const out = [];
  window.Konva.stages.forEach((st, si) => {
    const r = st.container().getBoundingClientRect();
    const k = r.width / st.width();
    st.find((n) => n.draggable && n.draggable() && n.isVisible()).forEach((n) => {
      const c = n.getClientRect();
      out.push({ si, id: n.id() || n.name(), cls: n.getClassName(), x: r.left + (c.x + c.width / 2) * k, y: r.top + (c.y + c.height / 2) * k, l: r.left + c.x * k, t: r.top + c.y * k, w: c.width * k, h: c.height * k, abs: n.absolutePosition() });
    });
  });
  return out;
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=430,900'] });
  const out = {};
  for (const sc of scenarios) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
    await ctx.addInitScript(INIT, NOSHARE);
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 160)); });
    const cdp = await ctx.newCDPSession(p);
    if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    await p.goto(url);
    await p.waitForFunction(() => window.Konva?.stages?.length >= 1 && document.querySelector('.konvajs-content'), null, { timeout: 90000 });
    await sleep(3000);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(60); await touch('touchEnd', []); await sleep(400); };
    const nodes = () => p.evaluate(nodesJs);
    const selected = () => p.evaluate(() => window.Konva.stages.flatMap((s, si) => s.find('Transformer').filter((t) => t.isVisible() && t.nodes().length).map((t) => si + ':' + t.nodes().map((n) => n.id() || n.getClassName()).join('+'))));
    const zoom = () => p.evaluate(() => getComputedStyle(document.querySelector('.heterogeneous-multipage__pages-container')).getPropertyValue('--canvas-zoom') || '1');
    const shot = (n) => p.screenshot({ path: `${process.env.OUT || "shots"}/${sc}-${n}.png`, scale: 'css' });
    const R = (out[sc] = {});
    try {
      if (sc === 'pinchTwoElements') {
        const ns = (await nodes()).filter((n) => n.si === 0 && n.cls !== 'Image' && n.y > 150 && n.y < 640);
        ns.sort((a, b) => a.y - b.y);
        const A = ns[0], B = ns[ns.length - 1];
        R.A = A.id; R.B = B.id;
        await touch('touchStart', [[A.x, A.y]]); await sleep(30);
        await touch('touchMove', [[A.x, A.y], [B.x, B.y]].slice(0, 1));
        await touch('touchStart', [[A.x, A.y], [B.x, B.y]]);
        for (let i = 1; i <= 20; i++) { await touch('touchMove', [[A.x, A.y - i * 4], [B.x, B.y + i * 4]]); await sleep(16); }
        await touch('touchEnd', []);
        await sleep(600);
        const after = await nodes();
        const a2 = after.find((n) => n.id === A.id && n.si === 0), b2 = after.find((n) => n.id === B.id && n.si === 0);
        R.AmovedAbsY = Math.round(a2.abs.y - A.abs.y); R.BmovedAbsY = Math.round(b2.abs.y - B.abs.y);
        R.selected = await selected(); R.zoom = await zoom();
        await shot('after');
      }
      if (sc === 'zoomReach') {
        const st = await p.evaluate(() => { const r = window.Konva.stages[0].container().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await cdp.send('Input.synthesizePinchGesture', { x: st.x, y: st.y, scaleFactor: 2.5, relativeSpeed: 400, gestureSourceType: 'touch' });
        await sleep(800);
        R.zoom = await zoom();
        R.geom = await p.evaluate(() => { const r = window.Konva.stages[0].container().getBoundingClientRect(); const m = document.querySelector('.canvas-editor-layout__main'); const c = document.querySelector('.canvas-editor-layout__canvas'); return { stageLeft: Math.round(r.left), stageRight: Math.round(r.right), vw: innerWidth, mainScrollW: m.scrollWidth, mainClientW: m.clientWidth, mainOverflowX: getComputedStyle(m).overflowX, canvasScrollW: c?.scrollWidth, canvasClientW: c?.clientWidth, canvasOverflowX: c && getComputedStyle(c).overflowX }; });
        // try horizontal swipe from the right gutter to reach left edge
        await cdp.send('Input.synthesizeScrollGesture', { x: 385, y: 400, xDistance: 300, gestureSourceType: 'touch', speed: 1500 });
        await sleep(400);
        R.afterSwipeStageLeft = await p.evaluate(() => Math.round(window.Konva.stages[0].container().getBoundingClientRect().left));
        R.zoomControlsInDom = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /zoom|vergr|verkl|100 ?%/i.test((b.getAttribute('aria-label') || '') + b.textContent)).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()).slice(0, 6));
        await shot('zoomed');
      }
      if (sc === 'textEdit') {
        const t = (await nodes()).find((n) => n.si === 0 && (process.env.TEXT_ID ? n.id === process.env.TEXT_ID : ((n.cls === 'Text' || n.cls === 'Group') && n.y > 150 && n.y < 640 && n.h < 120)));
        R.target = t.cls + ':' + t.id;
        await tap(t.x, t.y); await sleep(100); await tap(t.x, t.y); await sleep(300);
        await touch('touchStart', [[t.x, t.y]]); await touch('touchEnd', []); await sleep(80); await touch('touchStart', [[t.x, t.y]]); await touch('touchEnd', []); await sleep(800);
        R.editor = await p.evaluate(() => { const e = document.activeElement; if (!e || !(e.tagName === 'TEXTAREA' || e.isContentEditable)) return { active: e?.tagName }; const r = e.getBoundingClientRect(); return { tag: e.tagName, fontSize: getComputedStyle(e).fontSize, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) }; });
        await shot('editing');
        // scroll the main area through the gutter while editing: does the editor follow?
        const stTop0 = await p.evaluate(() => Math.round(window.Konva.stages[0].container().getBoundingClientRect().top));
        await p.evaluate(() => document.querySelector('.canvas-editor-layout__main').scrollBy(0, 120));
        await sleep(400);
        R.afterScroll = await p.evaluate((stTop0) => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { stageMovedBy: Math.round(window.Konva.stages[0].container().getBoundingClientRect().top) - stTop0, editorTop: Math.round(r.top), tag: e.tagName }; }, stTop0);
        await shot('editing-scrolled');
        await p.keyboard.press('Escape');
      }
      if (sc === 'gutterDeselect') {
        const t = (await nodes()).find((n) => n.si === 0 && n.cls !== 'Image' && n.y > 150 && n.y < 640);
        await tap(t.x, t.y);
        R.before = await selected();
        await cdp.send('Input.synthesizeScrollGesture', { x: 6, y: 600, yDistance: -150, gestureSourceType: 'touch', speed: 800 });
        await sleep(500);
        R.afterGutterScroll = await selected();
        R.selectionBar = await p.evaluate(() => !!document.querySelector('[class*="selection-bar" i], [class*="SelectionBar"]'));
      }
      if (sc === 'tapOtherPage') {
        const activeIdx = () => p.evaluate(() => { const ws = [...document.querySelectorAll('[data-page-index], .page-wrapper, [class*="page-wrapper"]')]; return ws.map((w) => (w.getAttribute('data-active') ?? w.className.match(/active|selected/)?.[0] ?? '') + '').slice(0, 5); });
        R.wrappersBefore = await activeIdx();
        // scroll page 2 into view via gutter
        await p.evaluate(() => { const s = window.Konva.stages[1].container(); s.scrollIntoView({ block: 'center' }); });
        await sleep(600);
        const t = (await nodes()).find((n) => n.si === 1 && n.cls !== 'Image' && n.y > 120 && n.y < 640);
        R.target = t && t.id;
        await tap(t.x, t.y);
        R.selected = await selected();
        R.wrappersAfter = await activeIdx();
        R.sidebarPageLabel = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^Seite \d/.test(e.textContent.trim())).map((e) => e.textContent.trim()).slice(0, 4));
        await shot('after');
      }
      if (sc === 'tapJitter') {
        const t = (await nodes()).find((n) => n.si === 0 && n.cls !== 'Image' && n.y > 150 && n.y < 640);
        const moves = [];
        for (let i = 0; i < 8; i++) {
          const b = (await nodes()).find((n) => n.id === t.id && n.si === 0).abs;
          await touch('touchStart', [[t.x, t.y]]); await touch('touchMove', [[t.x + 2, t.y + 2]]); await touch('touchMove', [[t.x + 4, t.y + 3]]); await touch('touchEnd', []);
          await sleep(300);
          const a = (await nodes()).find((n) => n.id === t.id && n.si === 0).abs;
          moves.push([Math.round(a.x - b.x), Math.round(a.y - b.y)]);
        }
        R.target = t.id; R.movesPerTap = moves;
      }
      if (sc === 'anchors') {
        const t = (await nodes()).find((n) => n.si === 0 && n.cls !== 'Image' && n.y > 150 && n.y < 640);
        await tap(t.x, t.y);
        R.anchors = await p.evaluate(() => { const tr = window.Konva.stages.flatMap((s) => s.find('Transformer')).find((t) => t.isVisible() && t.nodes().length); if (!tr) return null; const st = tr.getStage(); const k = st.container().getBoundingClientRect().width / st.width(); return { anchorSizeCfg: tr.anchorSize(), anchorCssPx: +(tr.anchorSize()).toFixed(1), enabled: tr.enabledAnchors(), padding: tr.padding(), stageScaleToCss: +k.toFixed(3) }; });
      }
      if (sc === 'share') {
        R.hasNavigatorShare = await p.evaluate(() => 'share' in navigator);
        const btn = p.getByRole('button', { name: /Teilen/ }).first();
        await btn.tap();
        await sleep(800);
        R.menuItems = await p.evaluate(() => [...document.querySelectorAll('[role=menuitem], [role=menu] button, [data-radix-popper-content-wrapper] button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 15));
        await shot('menu');
      }
      if (sc === 'exportAll') {
        const btn = p.getByRole('button', { name: /Teilen/ }).first();
        await btn.tap(); await sleep(800);
        R.menuItems = await p.evaluate(() => [...document.querySelectorAll('[role=menuitem], [role=menu] button, [data-radix-popper-content-wrapper] button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 15));
        const zip = p.getByText(/ZIP|Alle Seiten/i).first();
        if (await zip.count()) {
          const t0 = Date.now();
          const reqs = [];
          p.on('request', (r) => { if (r.url().includes('/exports')) reqs.push({ url: r.url().slice(-40), bytes: (r.postData() || '').length }); });
          await zip.tap();
          await p.waitForFunction(() => window.__bridge.some((m) => m.type === 'DOWNLOAD_FILE') || window.__errors.length, null, { timeout: 60000 }).catch(() => {});
          R.ms = Date.now() - t0; R.requests = reqs;
        }
        await shot('after');
      }
      if (sc === 'downloadPng') {
        const btn = p.getByRole('button', { name: /Teilen/ }).first();
        await btn.tap(); await sleep(800);
        R.menuItems = await p.evaluate(() => [...document.querySelectorAll('[role=menuitem], [role=menu] button, [data-radix-popper-content-wrapper] button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 15));
        await shot('menu');
      }
      if (sc === 'reflow6x') {
        const t = (await nodes()).find((n) => n.si === 0 && n.cls === 'Group' && n.y > 150 && n.y < 700) || (await nodes()).find((n) => n.si === 0 && n.cls === 'Text' && n.y > 150);
        await tap(t.x, t.y);
        const anchor = await p.evaluate(() => { const tr = window.Konva.stages.flatMap((s) => s.find('Transformer')).find((t) => t.isVisible() && t.nodes().length); const a = tr.findOne('.middle-right'); if (!a) return null; const st = tr.getStage(); const r = st.container().getBoundingClientRect(); const k = r.width / st.width(); const p = a.getAbsolutePosition(); return { x: r.left + (p.x + a.width() / 2) * k, y: r.top + (p.y + a.height() / 2) * k }; });
        R.target = t.cls + ':' + t.id; R.anchor = anchor;
        if (anchor) {
          await p.evaluate(() => { window.__lt0 = window.__lt.length; window.__fr = []; let l = performance.now(); window.__on = true; const f = (t) => { if (!window.__on) return; window.__fr.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
          await touch('touchStart', [[anchor.x, anchor.y]]);
          for (let i = 1; i <= 40; i++) { await touch('touchMove', [[anchor.x - i * 2, anchor.y]]); await sleep(16); }
          await touch('touchEnd', []); await sleep(400);
          R.perf = await p.evaluate(() => { window.__on = false; const f = window.__fr; const lt = window.__lt.slice(window.__lt0); return { frames: f.length, over33: f.filter((x) => x > 33.4).length, max: Math.round(Math.max(...f)), longTasks: lt }; });
          R.widthChanged = await p.evaluate((id) => window.Konva.stages[0].findOne('#' + id)?.width?.(), t.id);
        }
      }
    } catch (e) { R.error = String(e).slice(0, 300); }
    R.bridge = await p.evaluate(() => window.__bridge).catch(() => null);
    R.pageErrors = await p.evaluate(() => window.__errors).catch(() => null);
    R.console = logs.slice(0, 8);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
