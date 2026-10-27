# @ggraphic/collab

The brand-neutral collaboration session of the ggraphic design editor. Licensed under the [Mozilla Public License 2.0](./LICENSE).

`useCollaboration` owns one Yjs document per room: it connects a Hocuspocus provider, keeps an optional IndexedDB cache with an LRU registry, publishes the local awareness user and reports `isConnected`, `isSynced`, `isLocalLoaded`, `isReadOnly` and `authError`. Everything a host decides stays with the host: the server URL and token, the storage names (`localCache.dbPrefix`, `localCache.registryKey`), which rooms are cached at all, what the awareness user looks like, and which authentication failures are final (`classifyAuthFailure`).

It does not depend on the canvas editor, so text, board and chat surfaces can use it too.
