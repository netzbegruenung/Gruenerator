import GlassTabBar, { type GlassTab } from '../../../components/common/GlassTabBar';
import { getNotebookPath, type NotebookConfig } from '../config/notebookPagesConfig';

export type NotebookTab = 'chat' | 'uebersicht';

/** Same pill, same place as Chat | Arbeiten on the start page — only the tabs differ. */
export function NotebookTabs({
  config,
  active,
}: {
  config: Pick<NotebookConfig, 'slug'>;
  active: NotebookTab;
}) {
  const chatPath = getNotebookPath(config);
  const tabs: ReadonlyArray<GlassTab<NotebookTab>> = [
    { id: 'chat', label: 'Chat', path: chatPath, tone: 'neutral' },
    { id: 'uebersicht', label: 'Übersicht', path: `${chatPath}/uebersicht`, tone: 'green' },
  ];
  return (
    <GlassTabBar
      tabs={tabs}
      active={active}
      ariaLabel="Notebook-Bereiche"
      layoutId="notebook-tab-pill"
    />
  );
}
