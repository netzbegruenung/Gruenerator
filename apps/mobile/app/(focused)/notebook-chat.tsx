import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AssistantThread } from '../../components/chat';
import { InitialTurnSender } from '../../components/chat/InitialTurnSender';
import { NotebookGradientBackground } from '../../components/common/NotebookGradientBackground';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import {
  NotebookAnswerModeSheet,
  useAnswerModeAccessory,
} from '../../components/notebook/NotebookAnswerModeSheet';
import { NotebookChatFilterChips } from '../../components/notebook/NotebookChatFilterChips';
import { MobileNotebookChatProvider } from '../../providers/MobileNotebookChatProvider';
import { lightTheme, darkTheme } from '../../theme';
import { NOTEBOOK_COMPOSER_ACCENT } from '../../theme/toolTheme';

/**
 * A conversation with one notebook — mobile's counterpart of web's notebook
 * chat. Opened from the notebook page (a question), from the Wissen composer,
 * and from the thread list for notebook threads.
 */
export default function NotebookChatScreen() {
  const { notebookId, threadId, initialMessage, title } = useLocalSearchParams<{
    notebookId: string;
    threadId?: string;
    initialMessage?: string;
    title?: string;
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const displayTitle =
    title || NOTEBOOK_REGISTRY.find((nb) => nb.id === notebookId)?.title || 'Notebook';

  const [answerModeSheetVisible, setAnswerModeSheetVisible] = useState(false);
  const openAnswerModeSheet = useCallback(() => setAnswerModeSheetVisible(true), []);
  const answerModeAccessory = useAnswerModeAccessory(openAnswerModeSheet);
  const filterChips = useMemo(
    () => <NotebookChatFilterChips notebookId={notebookId} />,
    [notebookId]
  );

  return (
    <ScreenScaffold
      title={displayTitle}
      backdrop={<NotebookGradientBackground />}
      headerRight={null}
    >
      <MobileNotebookChatProvider notebookId={notebookId} threadId={threadId ?? null}>
        <AssistantThread
          theme={theme}
          welcome={{ title: displayTitle, subtitle: 'Was möchtest du wissen?', suggestions: [] }}
          transparent
          bareComposer
          composerAccessory={answerModeAccessory}
          composerAccent={NOTEBOOK_COMPOSER_ACCENT}
          composerHeader={filterChips}
        />
        {!threadId && initialMessage && (
          <InitialTurnSender message={initialMessage} drainAttachments={false} />
        )}
      </MobileNotebookChatProvider>
      <NotebookAnswerModeSheet
        visible={answerModeSheetVisible}
        onClose={() => setAnswerModeSheetVisible(false)}
        theme={theme}
      />
    </ScreenScaffold>
  );
}
