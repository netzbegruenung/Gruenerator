// Registers @testing-library/jest-dom's matchers (toBeInTheDocument, …) on
// vitest's Assertion type for typecheck. The runtime registration happens in
// vitest.setup.ts; this file exists so `tsc` sees the augmentation (the setup
// file lives outside the src tsconfig include).
import '@testing-library/jest-dom/vitest';

// vitest-axe ships an `extend-expect` augmentation, but it targets the legacy global
// `Vi.Assertion` namespace — vitest 4 resolves matchers off `module 'vitest'`, so
// augment that directly or `toHaveNoViolations` is invisible to tsc.
import { type AxeMatchers } from 'vitest-axe';

/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars --
   these interfaces exist only to merge AxeMatchers onto vitest's Assertion (T must
   keep the same arity to merge). */
declare module 'vitest' {
  interface Assertion<T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
