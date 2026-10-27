import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Pins, for every built-in template id, what each per-template switch answers:
 * the config the loader returns, the type check, the router's decision and the
 * props/callbacks it seeds the editor with, the host callback keys and the
 * picker metadata. The ids are F0 (stored in canvases, templates and Y.Docs),
 * so the list below is written out by hand instead of read from the code under
 * test: dropping or renaming one must turn this file red.
 */
const BUILTIN_IDS = [
  'zitat',
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'dreizeilen',
  'slider',
  'freeform',
  'profilbild',
  'sticker',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
  'slider-at',
] as const;

const captured: { props: Record<string, unknown> | null } = { props: null };

vi.mock('../components/CanvasEditor', () => ({
  CanvasEditor: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));

import { ControllableCanvasWrapper } from '../CanvasEditorRouter';
import { StandaloneCanvas } from '../components/StandaloneCanvas';
import { isValidCanvasType, loadCanvasConfig } from '../configs/configLoader';
import { HOST_CALLBACK_KEYS } from '../hostCallbackKeys';
import {
  TEMPLATE_REGISTRY,
  getAllTemplates,
  getCategoryForTemplate,
  getTemplateInfo,
  getTemplatesForLocale,
  templateFitsFormat,
} from '../utils/templateRegistry';

import type { CanvasConfigId } from '../configs/types';

/** Every state key any built-in template seeds from, each with a distinct value. */
const RICH_STATE: Record<string, unknown> = {
  quote: 'Q',
  name: 'N',
  header: 'H',
  body: 'B',
  eventTitle: 'ET',
  beschreibung: 'BE',
  weekday: 'WD',
  date: 'D',
  time: 'T',
  locationName: 'LN',
  address: 'A',
  headline: 'HL',
  subtext: 'ST',
  label: 'L',
  line1: 'L1',
  line2: 'L2',
  line3: 'L3',
  accent: 'AC',
  subline: 'SL',
  introline: 'IL',
  text: 'TX',
  backgroundMode: 'image',
  backgroundColor: '#123456',
  currentImageSrc: '/bg.jpg',
  imageOffset: { x: 1, y: 2 },
  imageScale: 1.5,
  backgroundImageOpacity: 0.7,
  imageAttribution: null,
  transparentImage: '/fg.png',
};

const FORMATS = [
  undefined,
  'post-portrait',
  'post-portrait-tall',
  'profile-square',
  'slide-16-9',
  'print-a4-hoch',
];

beforeAll(async () => {
  await Promise.all(BUILTIN_IDS.map((id) => loadCanvasConfig(id)));
}, 120_000);

afterEach(() => {
  cleanup();
  captured.props = null;
});

describe('built-in templates: config loader', () => {
  it.each(BUILTIN_IDS)('%s is a valid canvas type', (id) => {
    expect(isValidCanvasType(id)).toBe(true);
  });

  it.each(['', 'unknown', 'Zitat', 'dreizeilen-at', 'freeform ', 'constructor', 'toString'])(
    '%j is not a valid canvas type',
    (id) => {
      expect(isValidCanvasType(id)).toBe(false);
    }
  );

  it('rejects an unknown type with the known message', async () => {
    await expect(loadCanvasConfig('nope' as CanvasConfigId)).rejects.toThrow(
      'Unknown canvas type: nope'
    );
  });

  it.each(BUILTIN_IDS)('%s loads the same config fingerprint per format', async (id) => {
    const fingerprints: Record<string, unknown> = {};
    for (const formatId of FORMATS) {
      const config = await loadCanvasConfig(id, formatId);
      fingerprints[formatId ?? '(none)'] = {
        id: config.id,
        canvas: config.canvas,
        elements: config.elements.map((e) => (e as { id?: string }).id ?? '?'),
        tabs: config.tabs.map((t) => (t as { id?: string }).id ?? '?'),
        multiPage: config.multiPage
          ? { enabled: config.multiPage.enabled, maxPages: config.multiPage.maxPages ?? null }
          : null,
      };
    }
    expect(fingerprints).toMatchSnapshot();
  });
});

describe('built-in templates: host callback keys', () => {
  it('lists exactly the built-in ids', () => {
    expect(Object.keys(HOST_CALLBACK_KEYS).sort()).toEqual([...BUILTIN_IDS].sort());
  });
  it.each(BUILTIN_IDS)('%s', (id) => {
    expect(HOST_CALLBACK_KEYS[id]).toMatchSnapshot();
  });
});

describe('built-in templates: picker registry', () => {
  it('keeps registry order and entries', () => {
    expect(TEMPLATE_REGISTRY).toMatchSnapshot();
    expect(getAllTemplates().map((t) => t.id)).toMatchSnapshot();
  });
  it('offers per locale', () => {
    expect(getTemplatesForLocale('de-DE').map((t) => t.id)).toMatchSnapshot();
    expect(getTemplatesForLocale('de-AT').map((t) => t.id)).toMatchSnapshot();
  });
  it.each(BUILTIN_IDS)('%s: info, category, format fit', (id) => {
    expect(getTemplateInfo(id).id).toBe(id);
    expect({
      category: getCategoryForTemplate(id),
      fits: Object.fromEntries(FORMATS.map((f) => [f ?? '(none)', templateFitsFormat(id, f)])),
    }).toMatchSnapshot();
  });
  it('answers nothing for an unknown id', () => {
    const unknown = 'nope' as CanvasConfigId;
    expect(getCategoryForTemplate(unknown)).toBeUndefined();
    expect(getTemplateInfo(unknown)).toBeUndefined();
    expect(templateFitsFormat(unknown, 'post-portrait')).toBe(true);
    expect(templateFitsFormat(unknown, 'slide-16-9')).toBe(false);
  });
});

describe('built-in templates: router', () => {
  /** What the router hands the editor for this stored state. */
  async function mountedWith(
    id: CanvasConfigId,
    state: Record<string, unknown>,
    imageSrc?: string
  ) {
    render(
      <ControllableCanvasWrapper
        type={id}
        initialState={state}
        imageSrc={imageSrc}
        onExport={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    await waitFor(() => expect(captured.props).not.toBeNull(), { timeout: 10_000 });
    const props = captured.props!;
    return {
      initialConfigId: props.initialConfigId,
      maxPages: props.maxPages,
      initialProps: props.initialProps,
      callbacks: Object.keys(props.callbacks as Record<string, unknown>),
    };
  }

  it.each(BUILTIN_IDS)(
    '%s mounts the editor with the seeded props',
    async (id) => {
      expect(await mountedWith(id, RICH_STATE, '/legacy.jpg')).toMatchSnapshot();
    },
    20_000
  );

  // An empty state pins each template's own defaults (fallback colour, mode,
  // the legacy imageSrc prop) that a full state overrides.
  it.each(BUILTIN_IDS)(
    '%s seeds its defaults from an empty state',
    async (id) => {
      expect((await mountedWith(id, {}, '/legacy.jpg')).initialProps).toMatchSnapshot();
    },
    20_000
  );

  it('shows "not found" for an unknown type', async () => {
    render(
      <ControllableCanvasWrapper
        type="nope"
        initialState={{}}
        onExport={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(await screen.findByText('Editor type "nope" not found.')).toBeTruthy();
    expect(captured.props).toBeNull();
  });
});

describe('built-in templates: StandaloneCanvas', () => {
  it('reports an unknown id', async () => {
    render(<StandaloneCanvas configId={'nope' as CanvasConfigId} initialProps={{}} />);
    expect(await screen.findByText('Canvas error: Unknown canvas type: nope')).toBeTruthy();
  });
});
