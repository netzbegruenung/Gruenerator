import { describe, it, expect } from 'vitest';

import { loadCanvasConfig } from '../configs/configLoader';
import { TEMPLATE_REGISTRY } from './templateRegistry';

/**
 * Contract: every template the picker can offer must be page-capable —
 * adding it as a page reads `multiPage.defaultNewPageState`, and a config
 * without a `multiPage` block would silently produce a blank page.
 */
describe('template registry ↔ multiPage contract', () => {
  const ids = Object.keys(TEMPLATE_REGISTRY) as Array<keyof typeof TEMPLATE_REGISTRY>;

  it.each(ids)('config %s declares multiPage.enabled', async (id) => {
    const config = await loadCanvasConfig(id);
    expect(config.multiPage?.enabled).toBe(true);
  });
});
