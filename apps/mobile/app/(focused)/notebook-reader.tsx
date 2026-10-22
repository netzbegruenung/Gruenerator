import { buildNotebookSourceAttachment } from '@gruenerator/chat';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ResearchDocumentReader } from '../../components/notebook/ResearchDocumentReader';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { darkTheme, lightTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { goBackOr } from '../../utils/navigation';

import type { ModalRouteParams } from '../../types/routes';
import type { CreateAttachment } from '@assistant-ui/react-native';
import type { NotebookSourceRef } from '@gruenerator/contracts';

export default function NotebookReaderScreen() {
  const router = useRouter();
  const { collectionId, sourceUrl, documentId, notebookId, query, title, fromChat } =
    useLocalSearchParams<ModalRouteParams['/(focused)/notebook-reader']>();
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const ref: NotebookSourceRef = documentId
    ? { documentId, notebookId: notebookId ?? null }
    : { collectionId: collectionId ?? '', sourceUrl: sourceUrl ?? '' };

  // The new conversation drains the queued chip on mount (InitialTurnSender)
  // before it sends the opening message.
  const openInChat = (docTitle: string, message: string | null) => {
    usePendingAttachmentStore
      .getState()
      .add(buildNotebookSourceAttachment(ref, docTitle) as CreateAttachment);
    router.push(
      routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        ...(message ? { initialMessage: message } : {}),
      })
    );
  };

  return (
    <ResearchDocumentReader
      {...ref}
      query={query ?? ''}
      title={title ?? ''}
      theme={theme}
      onClose={() => goBackOr('/start')}
      {...(fromChat === '1' || !(documentId || (collectionId && sourceUrl))
        ? {}
        : { onOpenInChat: openInChat })}
    />
  );
}
