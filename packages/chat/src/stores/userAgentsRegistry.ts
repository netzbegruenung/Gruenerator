import { type Agent } from '@gruenerator/shared/agents';
import { create } from 'zustand';

/** A registry entry needs no prompt — a colleague's `systemRole` is owner-only. */
export type RegistryAgent = Omit<Agent, 'systemRole'>;

/**
 * Bridge for per-user agents into the platform-agnostic chat package. The host
 * app (which owns the `/api/user-agents` queries) pushes the caller's own
 * agents first, then colleagues' shared and public ones, so chat surfaces —
 * welcome screen, message avatar — can resolve a user agent's
 * title/description/icon the same way system agents are resolved from the
 * static registry.
 */
interface UserAgentsRegistryState {
  userAgents: RegistryAgent[];
  setUserAgents: (agents: RegistryAgent[]) => void;
}

export const useUserAgentsRegistry = create<UserAgentsRegistryState>((set) => ({
  userAgents: [],
  setUserAgents: (userAgents) => set({ userAgents }),
}));

/**
 * Find the agent a chat request names. That is `agentRef`: the row uuid for a
 * colleague's agent, the identifier for the caller's own. A uuid match wins;
 * an identifier resolves to the first entry carrying it — the caller's own
 * agent, since the host lists those first — which also keeps threads started
 * before the uuid switch resolving.
 */
export function findRegistryAgent<T extends { id?: string; identifier: string }>(
  agents: readonly T[],
  ref: string
): T | undefined {
  return agents.find((a) => a.id === ref) ?? agents.find((a) => a.identifier === ref);
}
