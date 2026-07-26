import { vi } from 'vitest';

/**
 * Minimal `react-native` stand-in for the Node lane. Only the surface the
 * logic-under-test actually reaches is implemented — extend it when a new test
 * needs more, rather than reaching for react-native-web.
 *
 * The mocks are `vi.fn()` so tests can assert on side effects (e.g. that
 * preferencesStore forwards 'system' to Appearance as the 'unspecified'
 * sentinel — the non-null contract that a null would turn into a native NPE).
 */
export const Appearance = {
  setColorScheme: vi.fn(),
  getColorScheme: vi.fn(() => 'light' as 'light' | 'dark' | null),
  addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
};

export const Platform = {
  OS: 'android' as 'android' | 'ios' | 'web',
  select: <T>(spec: { android?: T; ios?: T; native?: T; default?: T }): T | undefined =>
    spec.android ?? spec.native ?? spec.default,
};

export const Alert = {
  alert: vi.fn(),
  prompt: vi.fn(),
};

export const Linking = {
  openURL: vi.fn(async () => undefined),
  canOpenURL: vi.fn(async () => true),
};

export const Share = {
  share: vi.fn(async () => ({ action: 'sharedAction' as const })),
};

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  flatten: <T>(style: T): T => style,
  absoluteFill: {} as const,
  absoluteFillObject: {} as const,
  hairlineWidth: 1,
};

export const Dimensions = {
  get: (): { width: number; height: number; scale: number; fontScale: number } => ({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  }),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
};
