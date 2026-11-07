import { useMemo } from 'react';

import { getNotebookConfig } from '../config/notebookPagesConfig';
import { WissenDashboard } from '../wissen/WissenDashboard';

import { NotebookPageContent } from './NotebookPage';

/**
 * /wissen: die Notebook-Chatfläche mit dem Omni-Composer, darunter das
 * Wissens-Dashboard (`features/notebook/wissen/`). Ohne Frage ist das die
 * Startseite; nach der ersten Frage übernimmt der Notebook-Chat.
 */
function NotebooksIndexPage() {
  const config = useMemo(() => getNotebookConfig('gruenerator'), []);
  return (
    <NotebookPageContent
      config={config}
      startpageFooter={<WissenDashboard />}
      showExamples={false}
      hideGlobalChat
      omniComposer
      pageGradient={false}
    />
  );
}

/** Ohne Auth-Hülle — die Route `/wissen` prüft die Anmeldung selbst (RequireAuth). */
export { NotebooksIndexPage as NotebooksIndexContent };
