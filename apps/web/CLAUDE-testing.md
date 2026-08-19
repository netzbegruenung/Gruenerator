# Testing — apps/web

Two Vitest lanes in one config, split by what they need at runtime. The globs
never overlap, so neither picks up the other's files. Sibling document:
[apps/mobile/CLAUDE-testing.md](../mobile/CLAUDE-testing.md).

| Lane            | Glob              | Environment | Setup                              |
| --------------- | ----------------- | ----------- | ---------------------------------- |
| Logic           | `**/*.vitest.ts`  | `node`      | none                               |
| Component / DOM | `**/*.vitest.tsx` | `jsdom`     | [vitest.setup.ts](vitest.setup.ts) |

The file extension picks the lane. Both run under
`pnpm --filter @gruenerator/web test`. **Never flip the whole config to jsdom** —
the logic lane is the fast one and stays that way.

## Which tool?

| Component shape                                     | Tool                                             | Reference test                                                                                 |
| --------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Controlled component (props in, DOM out)             | RTL, `render` straight from `@testing-library/react` | [ToolsSection.vitest.tsx](src/features/workplace/components/ToolsSection.vitest.tsx)            |
| Component reading Query / Router / Tooltip           | RTL + `renderWithProviders`                      | [ProjektTile.vitest.tsx](src/features/groups/components/ProjektTile.vitest.tsx)                 |
| Data hook over the API client (success/error/empty)  | MSW + `renderHook`                               | [useMonitor.vitest.tsx](src/features/monitor/hooks/useMonitor.vitest.tsx)                       |
| Hand-written `aria-*` / `role=`                      | axe                                              | [SidebarSection.vitest.tsx](src/components/layout/Sidebar/SidebarSection.vitest.tsx)            |

`renderWithProviders` ([src/test-utils.tsx](src/test-utils.tsx)) mirrors the
app's provider tree — `QueryClientProvider` (retries off, `gcTime: 0`) +
`MemoryRouter` + `TooltipProvider` — and returns `user` (`userEvent.setup()`) and
`queryClient` alongside the RTL result. A pure props-in-DOM-out component does
**not** need it. Auth is a global Zustand singleton (`stores/authStore.ts`), not a
provider: tests that touch it seed the store, they do not wrap.

Import `axe` **from `src/test-utils.tsx`**, never from `vitest-axe` directly.
The local runner disables `color-contrast`, which needs a canvas and real layout;
in jsdom it only emits `getContext not implemented` noise. Contrast belongs to the
Playwright lane (`pnpm --filter @gruenerator/web test:a11y`).

## What the setup file provides

- `@testing-library/jest-dom/vitest` plus `vitest-axe/matchers`
  (`toBeInTheDocument`, `toHaveNoViolations`).
- `installMatchMediaStub()` — jsdom has no `window.matchMedia`, so any component
  reading a media query would throw instead of picking a branch. The stub
  ([src/test/match-media.ts](src/test/match-media.ts)) evaluates width rules
  against `window.innerWidth` (jsdom default 1024), so a test reaches the mobile
  branch by setting that value — see
  [breakpoint-md.vitest.tsx](src/test/breakpoint-md.vitest.tsx).
  **Twin file `packages/chat/src/test/match-media.ts` — change both.**
- No-op `ResizeObserver` and `Element.prototype.scrollIntoView`. Popup components
  measure their anchor on mount and cmdk scrolls to the active item; without the
  stubs a test dies on a missing browser API instead of on the thing under test.
- The MSW server ([src/test/msw-server.ts](src/test/msw-server.ts)) with
  `onUnhandledRequest: 'error'`, so a stray real network call is a loud failure
  rather than a silent hang. It ships **no** default handlers — each test
  registers its own via `server.use(...)`; `cleanup()` and `resetHandlers()` run
  in `afterEach`.

## MSW: getting the URL right

Give the client an explicit base and register handlers on the full URL:

```ts
beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
server.use(http.get('http://localhost/api/monitor/history', () => HttpResponse.json(entries)));
```

Without the `baseURL` the client resolves relative and the handler never matches.

## The load-bearing gotchas

The first two share one root cause: two React instances do not share the hook
dispatcher. The symptom is always
`Cannot read properties of null (reading 'useContext' / 'useEffect')` at render.

1. **The react alias.** `resolve` is declared at the top level **and** repeated
   inside every project — inline `test.projects` do not inherit the root-level
   `resolve`. `react` and `react-dom` are pinned to the hoisted copy in
   `<repo>/node_modules`, plus `dedupe`. The string alias `react` matches `react`
   and `react/jsx-runtime` but not `react-dom` (word boundary), which is why
   `react-dom` needs its own entry.
2. **`server.deps.inline`.** Vitest externalizes `node_modules` by default, which
   bypasses the alias above. Anything shipping its own nested react must
   therefore be inlined. Current list:
   `['@tanstack/react-query', /radix-ui/, '@gruenerator/ui']`.
   - `@tanstack/react-query` carries a nested react (measured 08/2026: 19.2.3
     under the package vs 19.2.8 hoisted).
   - The pattern is `/radix-ui/`, **not** `/@radix-ui/`: the shadcn components in
     `@gruenerator/ui` import from the `radix-ui` **umbrella** package, whose name
     has no `@` and so never matched the scoped pattern. Left externalized it
     Node-resolves its own `@radix-ui/*` deps and the inlining never reaches them.
     `packages/chat` carries the same pattern.
   - Recheck the offender list with `ls -d node_modules/**/node_modules/react`.
3. **jsdom is pinned exactly** in the root `pnpm.overrides`, so the three vitest
   lanes and jest-expo's `jest-environment-jsdom` share one copy. A bump therefore
   needs the override line too — see `pnpm overrides:fix`.

## packages/chat

[packages/chat/vitest.config.ts](../../packages/chat/vitest.config.ts) is the same
two-lane setup with the same `inline` list; only the path alias differs. The
difference that matters: there is **no `test-utils.tsx`** there, hence neither
`renderWithProviders` nor a preconfigured `axe`. Add them in that package rather
than importing across the package boundary.
