# Maestro E2E flows

The layer that catches what unit tests structurally cannot: SafeArea insets,
keyboard avoidance, Metro's React dedupe, native permissions, session restore
across an app restart. Six months of `fix(mobile):` history is dominated by that
class, and none of it is reachable from Vitest or jest-expo.

## Running on EAS

```bash
cd apps/mobile
npx eas-cli workflow:run .eas/workflows/e2e-test-android.yml
```

The workflow builds an APK with the `e2e-test` profile from [eas.json](../eas.json)
and runs the flows on EAS's device farm. No local emulator needed.

## Running locally

Against a connected device or emulator with Metro already serving
(`pnpm --filter @gruenerator/mobile start`):

```bash
pnpm --filter @gruenerator/mobile test:e2e            # all flows
pnpm --filter @gruenerator/mobile test:e2e -- maestro/boot-to-login.yaml   # one flow
```

Install Maestro once: `curl -Ls "https://get.maestro.mobile.dev" | bash`.

## Auth — which flows run where

This is the constraint that shapes everything else.

`DEV_AUTH_BYPASS` in [services/devAuth.ts](../services/devAuth.ts) is
`__DEV__ && EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true'`. The `__DEV__` half is the
hard backstop that keeps the bypass out of shipped builds (`e478007b9`), and it
is **not** relaxed for tests. The `e2e-test` profile produces a release APK, so
`__DEV__` is false there and the app lands on the login screen.

| Flow                | Needs a session? | Runs on EAS today |
| ------------------- | ---------------- | ----------------- |
| `boot-to-login`     | no               | ✅                |
| `smoke-tabs`        | yes              | ❌                |
| `login-persists`    | yes              | ❌                |
| `composer-keyboard` | yes              | ❌                |
| `chat-send`         | yes + backend    | ❌                |

The four authenticated flows run locally against a dev build
(`EXPO_PUBLIC_DEV_AUTH_BYPASS=true` under `expo start`). Getting them onto EAS
needs a build that keeps `__DEV__` true with the JS bundle embedded — an open
question, deliberately not solved by weakening the guard.

Because the bypass needs no backend, data-bearing sections render empty. The
authenticated flows therefore assert on shell and navigation, not on server
content. Point `EXPO_PUBLIC_API_URL` at the test backend when a flow needs real
data.

## Selectors

Prefer `id:` over visible text — the UI is German and copy changes are routine.
The testIDs the flows rely on:

| testID                                         | Where                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `onboarding-skip`                              | [app/(auth)/onboarding.tsx](<../app/(auth)/onboarding.tsx>) — skips the carousel  |
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
