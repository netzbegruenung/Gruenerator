const AWARENESS_ONLY_PREFIXES = ['chat-', 'group-presence-'];

export function isAwarenessOnlyRoom(documentId: string): boolean {
  return AWARENESS_ONLY_PREFIXES.some((prefix) => documentId.startsWith(prefix));
}
