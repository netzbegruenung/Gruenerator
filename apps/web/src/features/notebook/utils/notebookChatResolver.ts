import { NOTEBOOK_CONFIGS } from '../config/notebookPagesConfig';
import { SYSTEM_NOTEBOOKS } from '../config/notebooksConfig';
import { type NotebookChat } from '../stores/notebookChatStore';

export interface NotebookChatEntry {
  collectionKey: string;
  title: string;
  path: string;
  timestamp: number;
  messageCount: number;
}

interface UserCollection {
  id: string;
  name: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SystemNotebook = (typeof SYSTEM_NOTEBOOKS)[number];

const systemCollectionLookup: Record<string, { title: string; path: string }> = {};

for (const [, config] of Object.entries(NOTEBOOK_CONFIGS)) {
  if (config.collectionType === 'single' && config.collections.length === 1) {
    const collectionId = config.collections[0].id;
    const systemNb = SYSTEM_NOTEBOOKS.find(
      (nb: SystemNotebook) => nb.path.includes(config.id) || nb.id.includes(config.id)
    );
    if (systemNb) {
      systemCollectionLookup[collectionId] = {
        title: systemNb.title,
        path: systemNb.path,
      };
    }
  }
}

const grueneratorNotebook = SYSTEM_NOTEBOOKS.find(
  (nb: SystemNotebook) => nb.id === 'gruenerator-notebook'
);

function hasUserMessages(chat: NotebookChat): boolean {
  return chat.messages.some((m) => m.type === 'user');
}

export function resolveNotebookChatEntries(
  chats: Record<string, NotebookChat>,
  userCollections: UserCollection[]
): NotebookChatEntry[] {
  const entries: NotebookChatEntry[] = [];

  for (const [collectionKey, chat] of Object.entries(chats)) {
    if (!hasUserMessages(chat)) continue;

    if (collectionKey.startsWith('multi:') && grueneratorNotebook) {
      entries.push({
        collectionKey,
        title: grueneratorNotebook.title,
        path: grueneratorNotebook.path,
        timestamp: chat.timestamp,
        messageCount: chat.messages.length,
      });
      continue;
    }

    const systemEntry = systemCollectionLookup[collectionKey];
    if (systemEntry) {
      entries.push({
        collectionKey,
        title: systemEntry.title,
        path: systemEntry.path,
        timestamp: chat.timestamp,
        messageCount: chat.messages.length,
      });
      continue;
    }

    if (UUID_PATTERN.test(collectionKey)) {
      const userCol = userCollections.find((c) => c.id === collectionKey);
      if (userCol) {
        entries.push({
          collectionKey,
          title: userCol.name,
          path: `/notebook/${collectionKey}`,
          timestamp: chat.timestamp,
          messageCount: chat.messages.length,
        });
      }
    }
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}
