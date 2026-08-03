/**
 * Setup for the jest-expo component lane. jest-expo already mocks most Expo
 * native modules; only the ones our components reach that it does not cover are
 * stubbed here.
 *
 * `jest` is imported rather than taken from the global: @types/jest declares
 * `namespace jest` plus describe/it/expect, but no `jest` value, so the bare
 * global does not typecheck. Explicit imports also match the repo's Vitest
 * convention. babel-plugin-jest-hoist understands this import and still hoists
 * the `jest.mock` calls above the module imports.
 *
 * @testing-library/react-native cleans up rendered trees automatically, so
 * there is no explicit afterEach cleanup.
 */
import { jest } from '@jest/globals';

jest.mock('expo-router', () => {
  // One shared router object: `useRouter()` must hand back the same instance the
  // module exports, otherwise a test asserting on the imported `router.push`
  // inspects a different spy than the component called.
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => '/',
    useFocusEffect: jest.fn(),
    Link: 'Link',
    Stack: { Screen: 'Stack.Screen' },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// In-memory AsyncStorage, mirroring test/stubs/async-storage.ts used by the
// Vitest lane. Written out rather than pulling in the package's shipped jest
// mock, which is untyped and would leak `any` through the whole setup.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      clear: () => {
        store.clear();
        return Promise.resolve();
      },
      getAllKeys: () => Promise.resolve([...store.keys()]),
      multiRemove: (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
        return Promise.resolve();
      },
    },
  };
});
