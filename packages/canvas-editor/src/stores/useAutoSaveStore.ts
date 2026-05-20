/**
 * Re-exports the per-instance auto-save store hooks from {@link AutoSaveStoreProvider}.
 *
 * Existing call-sites that use `useAutoSaveStore((s) => s.foo)` keep working
 * unchanged as selector hooks. Call-sites that previously used static methods
 * (`useAutoSaveStore.getState()`, `useAutoSaveStore.subscribe(...)`) must
 * migrate to `useAutoSaveStoreApi().getState()` / `useAutoSaveStoreApi().subscribe(...)`
 * because the per-instance store cannot be reached from a function with no React
 * context. See `AutoSaveStoreProvider.tsx`.
 */

export {
  AutoSaveStoreProvider,
  useAutoSaveStore,
  useAutoSaveStoreApi,
  useAutoSaveStoreShallow,
} from './AutoSaveStoreProvider';
export type {
  AutoSaveStore,
  AutoSaveStoreApi,
  AutoSaveState,
  AutoSaveActions,
  AutoSaveStatus,
} from './createAutoSaveStore';
