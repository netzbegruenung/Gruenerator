/**
 * Which instance this browser session is talking to.
 *
 * Resolved once, from an explicit `VITE_INSTANCE_ID` if the deployment sets one
 * and otherwise from the host the page was served under. Anything unrecognised
 * falls back to `production`, so a new preview domain shows the conservative
 * selection instead of accidentally exposing unfinished work.
 *
 * This is the ONLY place in the web app that turns environment into an
 * instance. Everything downstream takes `CURRENT_INSTANCE` as a value — the
 * shared predicates are pure and know nothing about Vite, which is what lets
 * mobile and the backend reuse them.
 */
import { resolveInstance, type InstanceId } from '@gruenerator/shared/instances';

export const CURRENT_INSTANCE: InstanceId = resolveInstance({
  explicitId: (import.meta.env.VITE_INSTANCE_ID as string | undefined) ?? null,
  hostname: typeof window === 'undefined' ? null : window.location.hostname,
});
