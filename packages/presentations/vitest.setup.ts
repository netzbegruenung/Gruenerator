import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount rendered trees between tests so queries never see a prior test's DOM.
afterEach(() => {
  cleanup();
});
