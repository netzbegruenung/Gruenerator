/**
 * React hooks that also work inside an assistant-ui tap resource.
 *
 * `RemoteThreadListAdapter.unstable_useAdapters` is called from a tap
 * resource, not a React component, so plain React hooks there throw. The shim
 * dispatches to tap's hooks inside a resource and to React's outside. It ships
 * without type declarations (`"types": null` in its exports) because it mirrors
 * React's hook signatures exactly; this file supplies them.
 */
// @ts-expect-error -- the shim has no declarations; typed below with React's signatures
import * as shim from '@assistant-ui/tap/react-shim';
import {
  type useEffect as ReactUseEffect,
  type useMemo as ReactUseMemo,
  type useRef as ReactUseRef,
} from 'react';

const typed = shim as {
  useEffect: typeof ReactUseEffect;
  useMemo: typeof ReactUseMemo;
  useRef: typeof ReactUseRef;
};

export const useShimEffect = typed.useEffect;
export const useShimMemo = typed.useMemo;
export const useShimRef = typed.useRef;
