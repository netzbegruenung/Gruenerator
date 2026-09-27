import { describe, it, expect, beforeAll } from 'vitest';

import { loadCanvasConfig } from '../configs/configLoader';
import { TEMPLATE_REGISTRY } from './templateRegistry';

/**
 * Contract: every template the picker can offer must be page-capable —
 * adding it as a page reads `multiPage.defaultNewPageState`, and a config
 * without a `multiPage` block would silently produce a blank page.
 */
describe('template registry ↔ multiPage contract', () => {
  const ids = Object.keys(TEMPLATE_REGISTRY) as Array<keyof typeof TEMPLATE_REGISTRY>;

  // Dieselbe Ruestzeit wie in at-configs.vitest.ts und canvas-formats.vitest.ts:
  // der erste dynamische Import zieht die gesamte Konva-Kette nach, die allen
  // Sujets gemeinsam ist. Solange er im ersten Testfall lag, trug ein einzelner
  // Fall die Last des ganzen Blocks — mit 30 s riss er unter der Saettigung des
  // vollen `pnpm run ci` (48 Turbo-Tasks parallel), waehrend die Datei allein in
  // 2,4 s durchlief.
  //
  // Die 120_000 sind nicht dekorativ: `beforeAll` haengt an `hookTimeout`, nicht
  // an `testTimeout`, und das Paket setzt keins von beidem — die Vitest-Vorgabe
  // waere 10 s und damit UNTER dem gemessenen Worst Case von 20653 ms.
  beforeAll(async () => {
    await loadCanvasConfig(ids[0]);
  }, 120_000);

  it.each(ids)('config %s declares multiPage.enabled', async (id) => {
    const config = await loadCanvasConfig(id);
    expect(config.multiPage?.enabled).toBe(true);
  });
});
