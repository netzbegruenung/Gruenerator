import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Guard for the "background you cannot reach" class.
 *
 * The background has no sidebar tab: a click on it selects it, and the context
 * bar shows what `config.background` offers (colours, photo, zoom, lock). So
 * the background is reachable exactly when (a) the config declares those
 * controls, (b) there is a clickable element for each half — the colour plane
 * (`type: 'background'`, which `GenericCanvasElement` makes selectable) and the
 * photo (`background-image`) — and (c) nothing still routes to a tab that is
 * gone.
 *
 * History: seven templates once registered a background tab, kept it out of
 * `getVisibleTabs` and relied on an auto-switch that could never fire, because
 * the colour plane was drawn `listening={false}`. Clicking the background did
 * nothing at all.
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
  'slider-at',
];

/** The removed background tabs; no config may register them again. */
const REMOVED_TAB_IDS = ['background', 'image', 'image-background'];

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
 * Templates that knowingly draw no background surface. Currently none — every
 * template in TEMPLATES draws a reachable background (photo band or colour
 * plane). The list is kept so a future gap stays visible in code and the two
 * `skipIf` guards below keep working.
 */
const NO_BACKGROUND_SURFACE_YET: readonly CanvasConfigType[] = [];

/**
 * Templates whose plane colour is DERIVED rather than chosen. The slider's
 * `backgroundColor` follows `colorScheme` — its picker maps a swatch to a
 * scheme and the scheme decides the plane, the pill and the arrow together —
 * so writing the key directly is legitimately not honoured. Idempotence still
 * has to hold; only "the exact value comes back" does not apply.
 */
const DERIVED_BACKGROUND_COLOR: readonly CanvasConfigType[] = ['slider', 'slider-at'];

interface ElementLike {
  id: string;
  type: string;
  listening?: boolean;
}

interface PlaneLike extends ElementLike {
  colorKey?: string;
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

  it('offers its background controls through a click on the background', () => {
    expect(config.background, `${type} declares no background controls`).toBeDefined();
    const initial: unknown = config.createInitialState({});
    const actions = config.createActions(
      () => initial as never,
      () => {},
      () => {},
      () => {},
      {}
    );
    const controls = config.background!(initial as never, actions);
    const elements = config.elements as ElementLike[];

    if (controls.colors?.length) {
      expect(controls.onColorChange, `${type}: colours without a setter`).toBeTypeOf('function');
      expect(
        elements.some((el) => el.type === 'background'),
        `${type}: colours offered, but no colour plane to click`
      ).toBe(true);
    }
    if (controls.onImageChange) {
      const photo = elements.find((el) => el.id === 'background-image');
      expect(photo, `${type}: a photo is offered, but there is no photo element`).toBeDefined();
      expect(photo!.listening, `${type}: the photo cannot be clicked`).not.toBe(false);
    }
    expect(
      controls.colors?.length || controls.onImageChange,
      `${type}: background controls offer nothing`
    ).toBeTruthy();
  });

  it('no longer routes to a background tab', () => {
    const registered: string[] = config.tabs.map((t) => t.id);
    expect(registered.filter((id) => REMOVED_TAB_IDS.includes(id))).toEqual([]);
    expect(Object.keys(config.sections).filter((id) => REMOVED_TAB_IDS.includes(id))).toEqual([]);
    const targets = BACKGROUND_ELEMENT_PROBES.map((probe) => config.getAutoSwitchTab?.(probe));
    expect(targets.filter(Boolean), `${type}: a background click still opens a tab`).toEqual([]);
  });

  /**
   * Every template now draws a solid plane, and a plane whose colour key is
   * unset renders `CanvasBackground`'s white default — a white sharepic in
   * brand-green templates. `createInitialState` is a whitelist, so writing the
   * key is not enough: it has to be written THERE, or a card render and a
   * remote re-seed drop it. Round-trip, because that is the shape a re-seed
   * actually takes (`handleRemotePageState` pushes the previous state back
   * through this function).
   */
  it.skipIf(NO_BACKGROUND_SURFACE_YET.includes(type))(
    'starts on a real colour and keeps a chosen one through a re-seed',
    () => {
      const plane = (config.elements as PlaneLike[]).find(
        (el) => el.type === 'background' && typeof el.colorKey === 'string'
      );
      if (!plane?.colorKey) return; // photo-only templates have no colour plane

      const key = plane.colorKey;
      const initial = config.createInitialState({}) as Record<string, unknown>;
      expect(initial[key], `${type}: '${key}' is unset, the plane falls back to white`).toMatch(
        /^#[0-9a-fA-F]{6}$/
      );

      const once = config.createInitialState({ [key]: '#123456' }) as Record<string, unknown>;
      const twice = config.createInitialState(once) as Record<string, unknown>;

      // Idempotence holds everywhere: whatever the first pass settled on, the
      // second must not lose. This is the shape a re-seed actually takes.
      expect(twice[key], `${type}: '${key}' changes on a second re-seed`).toBe(once[key]);

      if (!DERIVED_BACKGROUND_COLOR.includes(type)) {
        expect(once[key], `${type}: '${key}' does not survive createInitialState`).toBe('#123456');
      }
    }
  );

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
