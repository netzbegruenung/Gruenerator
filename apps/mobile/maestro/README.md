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

Connecting the debug build to Metro on an emulator needs
`adb reverse tcp:8081 tcp:8081` — the dev client otherwise points at the host's
LAN IP, which the emulator cannot reach.

> **Working from a `.claude/worktrees/` worktree?** Metro's blockList in
> [metro.config.js](../metro.config.js) used to match the worktree's own path
> and blocked the app's sources, so nothing would bundle at all. That is fixed;
> if you ever see `Unable to resolve module ./node_modules/expo-router/entry`,
> check that guard first.

## Auth — which flows run where

This is the constraint that shapes everything else.

`DEV_AUTH_BYPASS` in [services/devAuth.ts](../services/devAuth.ts) is
`__DEV__ && EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true'`. The `__DEV__` half is the
hard backstop that keeps the bypass out of shipped builds (`e478007b9`), and it
is **not** relaxed for tests. The `e2e-test` profile produces a release APK, so
`__DEV__` is false there and the app lands on the login screen.

| Flow                | Needs a session? | Restarts the app? | Status                                    |
| ------------------- | ---------------- | ----------------- | ----------------------------------------- |
| `smoke-tabs`        | yes              | no                | ✅ verified green locally (debug build)   |
| `boot-to-login`     | no               | yes (clearState)  | ⏳ written for the EAS release APK, unrun |
| `login-persists`    | yes              | yes               | ⏳ blocked locally, see below             |
| `composer-keyboard` | yes              | no                | ⏳ unrun                                  |
| `chat-send`         | yes + backend    | no                | ⏳ needs `EXPO_PUBLIC_API_URL`            |

**Any flow that restarts the app cannot run against a local debug build.**
`stopApp` + `launchApp` drops the dev client's Metro connection; it relaunches
without a bundle and hangs on a blank screen — the process is alive but the view
hierarchy is empty, so the next assertion fails with a misleading "X is not
visible". `_dev-client-preamble.yaml` recovers the cases where the launcher UI
is actually showing, but not this one.

Both restart-dependent flows therefore need a build with the JS bundle embedded,
so there is no Metro to lose:

- `boot-to-login` gets that from the EAS `e2e-test` profile (release APK).
- `login-persists` needs `__DEV__` true **and** an embedded bundle at the same
  time — an open question, deliberately not solved by weakening the `__DEV__`
  guard.

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
