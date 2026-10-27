// SPDX-License-Identifier: MPL-2.0
/**
 * Toast seam. The editor reports failures and offers undo through a toast, but
 * ships no toast library: the host registers one. A module-level register
 * (like `registerBrandPacks`) because the callers sit in providers and
 * bridges that have no shared React context. Unregistered, every call is a
 * no-op.
 */
export interface EditorToastAction {
  label: string;
  onClick: () => void;
}

export interface EditorToastOptions {
  duration?: number;
  action?: EditorToastAction;
}

export interface EditorToast {
  (message: string, options?: EditorToastOptions): unknown;
  error: (message: string, options?: EditorToastOptions) => unknown;
}

const noop = (): void => {};
const NOOP_TOAST: EditorToast = Object.assign(noop, { error: noop });

let registered: EditorToast = NOOP_TOAST;

export function registerToast(impl: EditorToast): void {
  registered = impl;
}

export const toast: EditorToast = Object.assign(
  (...args: Parameters<EditorToast>) => registered(...args),
  { error: (...args: Parameters<EditorToast['error']>) => registered.error(...args) }
);
