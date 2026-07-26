# Maestro E2E flows

The layer that catches what unit tests structurally cannot: SafeArea insets,
keyboard avoidance, Metro's React dedupe, native permissions, session restore
across an app restart. Six months of `fix(mobile):` history is dominated by that
class, and none of it is reachable from Vitest or jest-expo.

## Running locally

Against a connected device or emulator with Metro already serving
(`pnpm --filter @gruenerator/mobile start`):

```bash
pnpm --filter @gruenerator/mobile test:e2e            # all flows
pnpm --filter @gruenerator/mobile test:e2e -- maestro/smoke-tabs.yaml   # one flow
```

Install Maestro once: `curl -Ls "https://get.maestro.mobile.dev" | bash`.

## Auth

Flows run against a build with `EXPO_PUBLIC_DEV_AUTH_BYPASS=true`, which seeds a
fake user past the Keycloak gate — see [services/devAuth.ts](../services/devAuth.ts).

> The `__DEV__` guard in that file is the hard backstop that keeps the bypass out
> of shipped builds (`e478007b9`). **Do not weaken it for E2E.** The consequence
> is that the CI build must be a _debug_ variant (`__DEV__ === true`) with the JS
> bundle embedded, so no Metro server has to run alongside the emulator — see
> [mobile-e2e.yml](../../../.github/workflows/mobile-e2e.yml).

Because the bypass needs no backend, data-bearing sections render empty. Flows
therefore assert on shell and navigation, not on server content. Point
`EXPO_PUBLIC_API_URL` at the test backend when a flow needs real data.

## Selectors

Prefer `id:` over visible text — the UI is German and copy changes are routine.
The testIDs the flows rely on:

| testID                                         | Where                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `login-open`                                   | [app/(auth)/login.tsx](<../app/(auth)/login.tsx>) — opens the source picker       |
| `login-source-detected` / `login-source-other` | locale-based login source (DE/AT)                                                 |
| `login-source-netzbegruenung`                  | Netzbegrünung login                                                               |
| `chat-composer-input`                          | [components/chat/AssistantComposer.tsx](../components/chat/AssistantComposer.tsx) |
| `chat-composer-send`                           | send button (only mounted once the input has text)                                |

Tab bar items are selected by their visible labels (`Chat`, `Arbeiten`,
`Wissen`, `Profil`) — those come from `Tabs.Screen` `title` props in
[components/navigation/ClassicTabLayout.tsx](../components/navigation/ClassicTabLayout.tsx)
and are stable navigation anchors rather than body copy.

## Adding a flow

Keep each flow to one user-visible outcome, and make it fail loudly rather than
silently pass: assert something that only exists _after_ the step, never just
that the app did not crash.
