/**
 * BlockNotes Mobile-Leiste im Docs-Editor — auf echtem Android-Chrome mit echter
 * Bildschirmtastatur.
 *
 * `docs-mobile-toolbar.spec.ts` simuliert die Tastatur, indem es den Viewport
 * verkleinert. Was dort nicht vorkommt: Chrome verschiebt bei offener Tastatur
 * den Visual Viewport, statt den Scroll-Container zu scrollen, und die Leiste
 * läuft dieser Verschiebung mit ihrer 0,2-s-Transition hinterher, rutscht also
 * unter die Tastatur. Das zeigt nur eine echte Tastatur, deshalb fährt dieser
 * Spec über `_android` den Chrome eines Emulators oder Geräts.
 *
 * Geprüft wird am Harness im Layout der Docs-Seite (`?layout=docs`):
 * - die Leiste liegt bündig auf der Tastatur,
 * - der Visual Viewport verschiebt sich nie (die Seite hängt an BlockNotes
 *   `bn-scroll-container`),
 * - der Cursor bleibt beim Tippen über der Leiste (ProseMirrors `scrollThreshold`).
 *
 * Läuft in keinem Workflow und überspringt sich ohne angeschlossenes Gerät:
 *   cd apps/web && pnpm exec playwright test docs-mobile-toolbar.android.spec.ts
 * (`ADB=<pfad>` setzen, wenn `adb` nicht im PATH liegt.)
 * Voraussetzungen: ein gebooteter Emulator (`adb devices`), in dem Chrome ohne
 * Erststart-Dialog startet, und keine App, die Chrome überlagert. Meldet der
 * Touchscreen auch STYLUS (AVDs tun das), öffnet Gboard statt der Tastatur
 * seine Handschrift-Leiste — dann einmal
 * `adb shell settings put secure stylus_handwriting_enabled 0`.
 */
import { execFileSync } from 'node:child_process';

import { test, expect, _android, type AndroidDevice, type Page } from '@playwright/test';

const HARNESS = '/tests/e2e/harness/docs-editor.html?layout=docs';

// Browserstart und jeder ADB-Befehl kosten auf dem Emulator Sekunden.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

let device: AndroidDevice | undefined;

const baseURL = () => test.info().project.use.baseURL ?? 'http://localhost:3000';

test.beforeAll(async () => {
  [device] = await _android.devices();
  if (!device) return;
  // Der Dev-Server des Hosts unter derselben Adresse im Gerät.
  const port = new URL(baseURL()).port;
  execFileSync(process.env.ADB ?? 'adb', [
    '-s',
    device.serial(),
    'reverse',
    `tcp:${port}`,
    `tcp:${port}`,
  ]);
});

test.afterAll(async () => {
  await device?.close();
});

interface Geometry {
  vvTop: number;
  vvBottom: number;
  toolbarTop: number | null;
  toolbarBottom: number | null;
  caretBottom: number | null;
}

function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const vv = window.visualViewport!;
    const toolbar = document
      .querySelector('.bn-mobile-formatting-toolbar')
      ?.getBoundingClientRect();
    const selection = window.getSelection();
    const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    return {
      vvTop: vv.offsetTop,
      vvBottom: vv.offsetTop + vv.height,
      toolbarTop: toolbar?.top ?? null,
      toolbarBottom: toolbar?.bottom ?? null,
      caretBottom: caret?.bottom ?? null,
    };
  });
}

/** Tippt echt (Touchscreen-Ereignis per ADB) in einen Absatz, den die Tastatur verdecken wird. */
async function tapLowParagraph(dev: AndroidDevice, page: Page): Promise<void> {
  const { width, height } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const size = /(\d+)x(\d+)/.exec((await dev.shell('wm size')).toString());
  const [screenW, screenH] = [Number(size![1]), Number(size![2])];
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  // Unterhalb der Browser-Leiste, oberhalb der Navigationsleiste: der Inhalt
  // endet höchstens ~70 px über dem Bildschirmrand, die Tastatur reicht weit
  // über 60 % der Höhe hinauf.
  const contentTop = screenH - 70 - height * dpr;
  const x = Math.round(Math.min(width * 0.6, screenW / dpr - 20) * dpr);
  const y = Math.round(contentTop + height * 0.8 * dpr);
  await dev.shell(`input touchscreen tap ${x} ${y}`);
}

test('Leiste bündig auf der Tastatur, Viewport ruhig, Cursor über der Leiste', async () => {
  test.skip(!device, 'kein Android-Gerät/Emulator angeschlossen');
  const dev = device!;
  const context = await dev.launchBrowser();
  try {
    const page = await context.newPage();
    await page.goto(new URL(HARNESS, baseURL()).toString(), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bn-editor p').first()).toBeVisible({ timeout: 60_000 });

    await tapLowParagraph(dev, page);
    await expect(page.locator('.bn-mobile-formatting-toolbar')).toBeVisible({ timeout: 10_000 });
    // Transition (0,2 s) und Chromes eigenes Nachscrollen abwarten.
    await page.waitForTimeout(1000);

    const samples: Geometry[] = [await measure(page)];
    await dev.shell('input text Hallo');
    await page.waitForTimeout(500);
    samples.push(await measure(page));
    for (let i = 0; i < 10; i++) {
      await dev.shell('input keyevent 66');
      await page.waitForTimeout(400);
      samples.push(await measure(page));
    }
    await dev.screenshot({ path: test.info().outputPath('keyboard.png') });

    for (const s of samples) {
      expect(s.vvTop, 'Visual Viewport hat sich verschoben').toBe(0);
      expect(s.toolbarBottom).not.toBeNull();
      expect(Math.abs(s.toolbarBottom! - s.vvBottom)).toBeLessThanOrEqual(1);
      expect(s.caretBottom!).toBeLessThanOrEqual(s.toolbarTop!);
    }
  } finally {
    await context.close();
  }
});
