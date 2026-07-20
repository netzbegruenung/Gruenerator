import { getContractsClient } from '@gruenerator/shared/api';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { SectionHeader } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { PiChatCircle } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

/**
 * Chats filed into this Space (chat_threads.group_id). A Space is a group; its
 * chats are the threads whose home Space is this group. Client-side filter over
 * the thread list — no dedicated endpoint needed.
 */
export function SpaceChatsSection({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['space-chats', groupId],
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status !== 200) return [];
      return res.body.filter((t) => t.groupId === groupId && t.status !== 'archived');
    },
  });

  if (!isLoading && threads.length === 0) return null;

  return (
    <div>
      <SectionHeader title="Chats" />
      <ul className="flex flex-col gap-1">
        {threads.map((t) => {
          const slug = t.slugSuffix ? buildChatThreadSlug(t.title, t.slugSuffix) : t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void navigate(`/chat/${slug}`)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800/40"
              >
                <PiChatCircle size={18} className="shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {t.title || 'Neue Unterhaltung'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
