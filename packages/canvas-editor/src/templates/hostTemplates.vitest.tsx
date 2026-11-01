import { GenericCanvas as GenericCanvasDirect } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  GenericCanvas,
  StandaloneCanvas,
  defineTemplate,
  registerTemplates,
  type AnyCanvasConfig,
} from '../index';

/**
 * A host without a built-in id mounts its own template: registered and opened
 * by id, or handed to StandaloneCanvas as a config object. Both must draw the
 * same canvas a built-in id draws.
 */

let simple: AnyCanvasConfig;

beforeAll(async () => {
  simple = await loadCanvasConfig('simple');
  // jsdom has no FontFaceSet; the editor waits on it before it draws text.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: () => true,
      load: async () => [],
      ready: Promise.resolve(),
      status: 'loaded',
      addEventListener() {},
      removeEventListener() {},
    },
  });
}, 120_000);

afterEach(() => {
  cleanup();
  for (const stage of [...Konva.stages]) stage.destroy();
});

const HOST_TEMPLATE = defineTemplate({
  id: 'host-demo',
  load: async () => ({ ...simple, id: 'host-demo' }),
});

const PROPS = { headline: 'Gastgeber-Vorlage', subtext: 'eingehängt' };

/** Text drawn on the stage, once it shows the seeded headline. */
async function stageTexts(): Promise<string[]> {
  let texts: string[] = [];
  await waitFor(
    () => {
      const stage = Konva.stages[0];
      texts = stage ? stage.find('Text').map((n) => (n as Konva.Text).text()) : [];
      expect(texts).toContain(PROPS.headline);
    },
    { timeout: 10_000 }
  );
  return texts;
}

describe('host templates', () => {
  it('mounts a registered host template by id', async () => {
    registerTemplates(HOST_TEMPLATE);
    render(<StandaloneCanvas configId="host-demo" initialProps={PROPS} preview />);
    const host = await stageTexts();

    cleanup();
    for (const stage of [...Konva.stages]) stage.destroy();
    render(<StandaloneCanvas configId="simple" initialProps={PROPS} preview />);
    expect(host).toEqual(await stageTexts());
  });

  it('mounts a config object without any registration', async () => {
    render(
      <StandaloneCanvas config={{ ...simple, id: 'unregistered' }} initialProps={PROPS} preview />
    );
    expect(await stageTexts()).toContain(PROPS.subtext);
  });

  it('still reports an id nobody registered', async () => {
    render(<StandaloneCanvas configId="never-registered" initialProps={{}} />);
    expect(await screen.findByText(/Unbekannter Canvas-Typ: never-registered/)).toBeTruthy();
  });

  it('refuses to replace a built-in or an already registered id', () => {
    expect(() =>
      registerTemplates(defineTemplate({ id: 'zitat', load: async () => simple }))
    ).toThrow('Template "zitat" is already registered');
    registerTemplates(HOST_TEMPLATE);
    expect(() =>
      registerTemplates(defineTemplate({ id: 'host-demo', load: async () => simple }))
    ).toThrow('Template "host-demo" is already registered');
  });

  it('exports GenericCanvas from the package entry', () => {
    expect(GenericCanvas).toBe(GenericCanvasDirect);
  });
});
