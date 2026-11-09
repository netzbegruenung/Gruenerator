import { TooltipProvider } from '@gruenerator/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { configureAxe } from 'vitest-axe';

/**
 * Stricter `label` rule: axe accepts a non-empty `placeholder` as the name of a
 * form field (check `non-empty-placeholder`), so an input labelled only by its
 * hint text passes. WCAG 2.2 SC 3.3.2 / 4.1.2 and `docs/CLAUDE-a11y.md` do not:
 * the hint vanishes on input and is often too short to say what the field is
 * for (#5530 — the chat composer). Only the `label` rule uses this check.
 * Mirrored in the other `test-utils` and in `apps/web/tests/e2e/a11y.spec.ts`.
 */
const PLACEHOLDER_IS_NO_LABEL = {
  checks: [{ id: 'non-empty-placeholder', enabled: false }],
};

/**
 * jsdom-appropriate axe runner. Import this instead of `axe` from 'vitest-axe':
 * color-contrast needs a canvas + real layout, which jsdom lacks, so it only
 * spews "getContext not implemented" noise here — that check belongs in a real
 * browser (Playwright), not the render lane.
 */
export const axe = configureAxe({
  globalOptions: PLACEHOLDER_IS_NO_LABEL,
  rules: { 'color-contrast': { enabled: false } },
});

/**
 * Render helper mirroring the app's provider tree (see App.tsx) for component
 * tests that read from TanStack Query, the router, or tooltips.
 *
 * Pure controlled components (props in, DOM out) do NOT need this — import
 * `render` from '@testing-library/react' directly. Auth is a global Zustand
 * singleton (stores/authStore.ts), not a provider: tests that touch it seed/reset
 * the store module, they do not wrap.
 */
interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

function makeQueryClient() {
  return new QueryClient({
    // Deterministic tests: no retries, no refetch churn.
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderWithProvidersOptions = {}
) {
  const queryClient = makeQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <TooltipProvider>{children}</TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}

export * from '@testing-library/react';
export { userEvent };
