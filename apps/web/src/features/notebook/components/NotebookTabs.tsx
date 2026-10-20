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
    { id: 'chat', label: 'Chat', path: chatPath },
    { id: 'uebersicht', label: 'Übersicht', path: `${chatPath}/uebersicht` },
  ];
  return <GlassTabBar tabs={tabs} active={active} ariaLabel="Notebook-Bereiche" />;
}
