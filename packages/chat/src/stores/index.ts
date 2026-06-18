// Lightweight store-only entry point.
//
// Boot code (auth store, profile hydration, sidebar) needs a couple of zustand
// stores but must NOT reach them through the main package barrel: that barrel
// statically re-exports the assistant-ui components, so importing anything from
// it lets the bundler co-chunk those ~heavy components onto the initial load.
//
// Importing from `@gruenerator/chat/stores` gives boot code a module graph that
// reaches only these plain zustand stores (no assistant-ui, no components), so
// the primitives stay in lazy chunks. Keep this file free of any component or
// assistant-ui import.
export { useUserProfileStore, type UserRole } from './userProfileStore';
export { useAgentStore } from './chatStore';
export { setThreadListSlot, useThreadListSlot } from './threadListSlotStore';
