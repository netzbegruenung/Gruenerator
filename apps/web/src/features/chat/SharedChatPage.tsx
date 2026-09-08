import {
  ReadonlyThreadProvider,
  ReadonlyThreadView,
  convertToThreadMessageLike,
  type LoadedMessage,
} from '@gruenerator/chat';
import { type ResolveSharedThreadResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HiOutlineChatAlt2 } from 'react-icons/hi';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '@/components/ErrorBoundary';
import { platformFetch } from '@/utils/platformFetch';

/**
 * Read-only archive view of a shared chat thread — the target of the
 * /chat/geteilt/<slug> link and of read-only group shares.
 *
 * Live view, not a snapshot: it renders whatever the thread currently holds;
 * revoking the share makes the resolve 404 and the link dead. Deliberately
 * NOT the live ChatPage: no composer, no thread list, no global chat runtime —
 * an isolated local runtime renders the transcript (see ReadonlyThreadProvider).
 */
function SharedChatContent() {
  const { threadSlug } = useParams<{ threadSlug: string }>();
  const navigate = useNavigate();

  const { data: thread, isLoading } = useQuery<ResolveSharedThreadResponse | null>({
    queryKey: ['shared-thread', threadSlug],
    enabled: !!threadSlug,
    retry: false,
    queryFn: async () => {
      const res = await getContractsClient().chatThreadSharing.resolveShared({
        params: { slugOrId: threadSlug! },
      });
      if (res.status === 200) return res.body;
      return null;
    },
  });

  const { data: messages } = useQuery<LoadedMessage[]>({
    queryKey: ['shared-thread-messages', thread?.id],
    enabled: !!thread,
    queryFn: async () => {
      const res = await platformFetch(`/api/chat-service/messages?threadId=${thread!.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LoadedMessage[];
    },
  });

  const converted = useMemo(
    () => (messages ? convertToThreadMessageLike(messages) : null),
    [messages]
  );

  const fork = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().chatThreadSharing.fork({
        params: { threadId: thread!.id },
        body: {},
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return res.body;
    },
    onSuccess: (body) => {
      const slug = body.slugSuffix
        ? buildChatThreadSlug(body.title, body.slugSuffix)
        : body.threadId;
      void navigate(`/chat/${slug}`);
    },
    onError: () => {
      toast.error('Der Chat konnte nicht kopiert werden. Bitte versuche es erneut.');
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="mx-auto max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
          <div className="mb-4 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-background-alt text-foreground">
              <HiOutlineChatAlt2 className="size-6" />
            </div>
          </div>
          <h1 className="text-lg font-medium text-foreground-heading">Chat nicht verfügbar</h1>
          <p className="mx-auto mt-2 text-sm leading-relaxed text-foreground opacity-70">
            Dieser geteilte Chat ist nicht (mehr) verfügbar — der Link wurde zurückgezogen oder der
            Chat gelöscht.
          </p>
          <Button variant="brand" size="brand" className="mt-6" asChild>
            <Link to="/chat">Zum Chat</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Owners and collaborators belong in the live chat, not the archive.
  if (thread.accessLevel === 'owner' || thread.accessLevel === 'write') {
    const slug = thread.slugSuffix
      ? buildChatThreadSlug(thread.title, thread.slugSuffix)
      : thread.id;
    return <Navigate to={`/chat/${slug}`} replace />;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground-heading">
              {thread.title || 'Geteilter Chat'}
            </h1>
            <p className="text-xs text-foreground-muted">
              {thread.ownerName ? `Geteilt von ${thread.ownerName}` : 'Geteilter Chat'}
              {' · Nur lesen'}
            </p>
          </div>
          <Button
            variant="brand"
            size="sm"
            onClick={() => fork.mutate()}
            disabled={fork.isPending || !messages}
          >
            {fork.isPending ? 'Kopie wird erstellt…' : 'In eigenem Chat fortsetzen'}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {converted ? (
          <ReadonlyThreadProvider messages={converted}>
            <ReadonlyThreadView className="mx-auto w-full max-w-3xl" />
          </ReadonlyThreadProvider>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
          </div>
        )}
      </div>
    </div>
  );
}

function SharedChatPage() {
  return (
    <ErrorBoundary>
      <SharedChatContent />
    </ErrorBoundary>
  );
}

export default withAuthRequired(SharedChatPage, {
  title: 'Geteilter Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
