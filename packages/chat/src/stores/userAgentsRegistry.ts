import { type Agent } from '@gruenerator/shared/agents';
import { create } from 'zustand';

/**
 * Bridge for per-user agents into the platform-agnostic chat package. The host
 * app (which owns the `/api/user-agents` query) pushes the fetched agents here
 * so chat surfaces — welcome screen, message avatar — can resolve a user
 * agent's title/description/icon by identifier, the same way system agents are
 * resolved from the static registry.
 */
interface UserAgentsRegistryState {
  userAgents: Agent[];
  setUserAgents: (agents: Agent[]) => void;
}

export const useUserAgentsRegistry = create<UserAgentsRegistryState>((set) => ({
  userAgents: [],
  setUserAgents: (userAgents) => set({ userAgents }),
}));
