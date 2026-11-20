/**
 * Chats eines Projekts (`chat_threads.group_id`): Filter und Reihenfolge der
 * Liste in „Übersicht" — Web und App lesen dieselbe Thread-Liste und
 * schneiden sie clientseitig, einen eigenen Endpunkt gibt es nicht.
 */
/** Nicht archivierte Threads des Projekts, zuletzt bearbeitet zuerst. */
export function projectChatThreads<
  T extends { groupId: string | null; status: string; updatedAt: string },
>(threads: readonly T[], groupId: string): T[] {
  return threads
    .filter((t) => t.groupId === groupId && t.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
