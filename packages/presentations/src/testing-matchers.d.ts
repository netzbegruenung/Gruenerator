// Types for the matchers vitest.setup.ts registers at runtime via expect.extend —
// jest-dom's (toBeInTheDocument, …) and vitest-axe's (toHaveNoViolations). This
// file exists so `tsc` sees them (the setup file lives outside the src tsconfig
// include).
//
// Not `import '@testing-library/jest-dom/vitest'`: that augmentation still
// targets vitest 4's single-parameter `Assertion<T>`, and on vitest 5 its
// matchers return the received value instead of `void`/`Promise<void>`. Since
// vitest 5 custom matchers go on `Matchers<R, T>`, whose type parameters must
// match vitest's own declaration.
//
// vitest-axe's own `extend-expect` targets the legacy global `Vi.Assertion`
// namespace, so its matchers are merged here as well.
import { type TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { type AxeMatchers } from 'vitest-axe';

/* eslint-disable @typescript-eslint/no-unused-vars --
   these interfaces exist only to merge the matcher types onto vitest's. */
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R>, AxeMatchers {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown>, AxeMatchers {}
}
