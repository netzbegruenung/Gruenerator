import { beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configLoader';

/**
 * Guard for the "background you cannot reach" class.
 *
 * Three places decide whether a user ever sees the background controls: the
 * `tabs` array registers the entry, `getVisibleTabs` decides whether it is
 * drawn in the strip, and `getAutoSwitchTab` can open a hidden one when an
 * element is selected. Seven templates registered a `background` tab, wrote a
 * full section for it, kept it OUT of `getVisibleTabs`, and relied on the
 * auto-switch — which could never fire, because the only element it named is
 * the colour plane, and `primitives/CanvasBackground.tsx` renders that with a
 * hardcoded `listening={false}`. No error, no log, just a panel no route
 * reaches: zitat-pure, info, zitat-pure-at, info-at, slider, freeform,
 * freeform-at.
 *
 * This replaces the older `backgroundAutoSwitch.vitest.ts`, which pinned the
 * auto-switch target for three configs but never asked the question that
 * actually mattered: is the tab reachable at all?
 *
 * Historical note: `configs/unifiedTabs.ts` described the intended end state —
 * one `background` tab per template whose content adapts between image and
 * colour. It was never wired to anything, and its narrative is what justified
 * the "registered but hidden" comments that hid these panels. The tab ids stay
 * template-specific (`image` / `image-background` / `background`); this guard
 * accepts any of them and only insists that the user can get there.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

const TEMPLATES: CanvasConfigType[] = [
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'dreizeilen',
  'zitat',
  'slider',
  'freeform',
  'profilbild',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
];

/** Tab ids that carry background controls, newest naming first. */
const BACKGROUND_TAB_IDS = ['background', 'image', 'image-background'];

/**
 * Element ids that a `getAutoSwitchTab` implementation might plausibly name.
 * Probing the vocabulary rather than reading the source keeps the guard honest
 * about ids that were renamed on one side only — freeform matched
 * `'background'` for years while its colour plane was called
 * `'background-color'`.
 */
const BACKGROUND_ELEMENT_PROBES = [
  'background',
  'background-image',
  'background-color',
  'canvas-fallback',
];

/**
 * Templates that knowingly draw no background surface. `veranstaltung` offers a
 * `Bild` tab and carries `currentImageSrc`, but its `elements` array holds only
 * the green band and two texts — the config says so at its `elements:` comment
 * ("complex elements (circle with rotated text, clipped photo) that don't fit
 * the generic element model well. Using simplified elements."). The picked
 * photo is therefore never drawn. Reproducing the clipped geometry is design
 * work, not a rename, so it stays out of this pass; the exception is listed
 * here rather than dropped from the guard so the gap is visible in code.
 */
const NO_BACKGROUND_SURFACE_YET: readonly CanvasConfigType[] = ['veranstaltung'];

interface ElementLike {
  id: string;
  type: string;
  listening?: boolean;
}

/**
 * A selection can only land on an element Konva is listening to, and the
 * `background` primitive is never listening — so an auto-switch branch naming
 * one is dead code, not a route.
 */
function isClickable(el: ElementLike): boolean {
  return el.listening !== false && el.type !== 'background';
}

describe.each(TEMPLATES)('%s: the background is reachable', (type) => {
  // Loaded once with its own budget: the first `loadCanvasConfig` pulls the
  // whole Konva chain through a dynamic import (~2.2s, see at-configs.vitest.ts),
  // which busts the 5s default on a loaded CI runner.
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 120_000);

  const visibleIds = () =>
    config.getVisibleTabs
      ? config.getVisibleTabs(config.createInitialState({}), { selectedElement: null })
      : config.tabs.map((t) => t.id);

  it.skipIf(NO_BACKGROUND_SURFACE_YET.includes(type))('draws a background surface', () => {
    const surfaces = (config.elements as ElementLike[]).filter(
      (el) => el.type === 'background' || BACKGROUND_ELEMENT_PROBES.includes(el.id)
    );
    expect(surfaces.map((el) => el.id)).not.toEqual([]);
  });

  it('offers its background tab in the tab strip', () => {
    const tabId = BACKGROUND_TAB_IDS.find((id) => id in config.sections);
    expect(tabId, `${type} has no background section at all`).toBeDefined();
    expect(visibleIds(), `${type}: section '${tabId}' exists but no route reaches it`).toContain(
      tabId
    );
  });

  it('only auto-switches on elements that can actually be clicked', () => {
    if (!config.getAutoSwitchTab) return;
    const elements = config.elements as ElementLike[];

    const dead = BACKGROUND_ELEMENT_PROBES.filter((probe) => {
      if (!config.getAutoSwitchTab?.(probe)) return false;
      return !elements.some((el) => el.id === probe && isClickable(el));
    });

    expect(dead, `${type}: auto-switch names unclickable/absent ${dead.join(', ')}`).toEqual([]);
  });

  /**
   * The deleted `backgroundAutoSwitch.vitest.ts` pinned the literal target id
   * per template (`background-image` -> `image` for simple, -> `image-background`
   * for dreizeilen). Pinning the id is brittle and says nothing useful; the
   * property that actually matters is that clicking a background element lands
   * on a background panel that exists. A redirect to a different but registered
   * tab would otherwise slip through every other assertion here.
   */
  it('auto-switches background elements onto a real background tab', () => {
    if (!config.getAutoSwitchTab) return;
    const registered: string[] = config.tabs.map((t) => t.id);

    const wrong = BACKGROUND_ELEMENT_PROBES.map((probe) => ({
      probe,
      target: config.getAutoSwitchTab?.(probe) as string | null | undefined,
    }))
      .filter((hit): hit is { probe: string; target: string } => Boolean(hit.target))
      .filter(
        (hit) =>
          !BACKGROUND_TAB_IDS.includes(hit.target) ||
          !registered.includes(hit.target) ||
          !(hit.target in config.sections)
      )
      .map((hit) => `${hit.probe} -> ${hit.target}`);

    expect(
      wrong,
      `${type}: auto-switch lands off the background panel: ${wrong.join(', ')}`
    ).toEqual([]);
  });

  it('only makes tabs visible that are actually registered', () => {
    const registered = config.tabs.map((t) => t.id);
    const phantom = visibleIds().filter((id) => !registered.includes(id));
    expect(phantom, `${type}: getVisibleTabs names unregistered ${phantom.join(', ')}`).toEqual([]);
  });

  it('backs every visible tab with a section', () => {
    const empty = visibleIds().filter((id) => !(id in config.sections));
    expect(empty, `${type}: visible tabs render nothing: ${empty.join(', ')}`).toEqual([]);
  });
});
