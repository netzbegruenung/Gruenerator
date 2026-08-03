// Registers @testing-library/jest-dom's matchers (toBeInTheDocument, …) on
// vitest's Assertion type for typecheck. The runtime registration happens in
// vitest.setup.ts; this file exists so `tsc` sees the augmentation (the setup
// file lives outside the src tsconfig include).
import '@testing-library/jest-dom/vitest';
