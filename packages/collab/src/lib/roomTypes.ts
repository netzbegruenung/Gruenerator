export type RoomKind =
  | { kind: 'persisted'; documentId: string }
  | { kind: 'awareness-only'; threadId: string }
  | { kind: 'broadcast-only'; threadId: string };

export function classifyRoom(documentName: string): RoomKind {
  if (documentName.startsWith('chat-')) {
    return { kind: 'broadcast-only', threadId: documentName.slice('chat-'.length) };
  }
  if (documentName.startsWith('group-presence-')) {
    return { kind: 'awareness-only', threadId: documentName.slice('group-presence-'.length) };
  }
  return { kind: 'persisted', documentId: documentName };
}

export function isAwarenessOnlyRoom(documentName: string): boolean {
  const room = classifyRoom(documentName);
  return room.kind === 'awareness-only' || room.kind === 'broadcast-only';
}

export function isBroadcastOnlyRoom(documentName: string): boolean {
  return classifyRoom(documentName).kind === 'broadcast-only';
}

export function isPersistedRoom(documentName: string): boolean {
  return classifyRoom(documentName).kind === 'persisted';
}
