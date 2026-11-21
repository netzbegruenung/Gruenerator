import '@ggraphic/editor-chrome/styles.css';

import { SidebarPanel, SidebarTabBar } from '@ggraphic/editor-chrome';
import { useEffect, type ReactNode } from 'react';

import { LegalPanel } from '../../components/editor/legal/LegalPanel';
import { DesignPanel } from '../../components/editor/settings/DesignPanel';
import { SettingsPanel } from '../../components/editor/settings/SettingsPanel';
import { useDraft } from '../../draft/SiteDraftContext';
import { useEditorStore } from '../../stores/editorStore';
import { SITE_BLOCK_UI } from '../blockUi';
import { SelectionForm } from '../canvas/SelectionForm';

import { BlocksPanel } from './BlocksPanel';
import { PagePanel } from './PagePanel';
import { revealBlock } from './revealBlock';
import { SIDEBAR_TABS, type SidebarTabId } from './tabs';

const TABS = [...SIDEBAR_TABS];

/** The rail's tab bar: a vertical rail on desktop, the bottom bar on a phone. */
export function SiteSidebarTabs() {
  const tab = useEditorStore((s) => s.sidebarTab);
  const openTab = useEditorStore((s) => s.openSidebarTab);
  return (
    <SidebarTabBar<SidebarTabId>
      tabs={TABS}
      activeTab={tab}
      onTabClick={(id) => openTab(tab === id ? null : id)}
      ariaLabel="Bereiche der Website"
    />
  );
}

/**
 * The panel beside the rail (a sheet on a phone): a rail tab, or the form of the block selected
 * on the page. Opening one closes the other (`editorStore`).
 */
export function SiteSidebarPanel() {
  const tab = useEditorStore((s) => s.sidebarTab);
  const elementPanel = useEditorStore((s) => s.elementPanel);
  const selection = useEditorStore((s) => s.selection);
  const openTab = useEditorStore((s) => s.openSidebarTab);
  const openElementPanel = useEditorStore((s) => s.openElementPanel);
  const select = useEditorStore((s) => s.select);
  const blockType = useDraft((d) =>
    selection ? (d.blocks.find((b) => b.id === selection.blockId)?.type ?? null) : null
  );

  // A selected block that is gone (deleted here, from the toolbar or by someone else) leaves
  // no selection behind: the toolbar would anchor to nothing and the form would stay empty.
  const selectionGone = selection !== null && blockType === null;
  useEffect(() => {
    if (selectionGone) select(null);
  }, [selectionGone, select]);

  const selectBlock = (blockId: string) => {
    select({ blockId, itemId: null, path: null });
    revealBlock(blockId);
  };
  const selectedBlockId = selection?.blockId ?? null;

  let title: string | undefined;
  let content: ReactNode = null;
  if (tab !== null) {
    title = SIDEBAR_TABS.find((t) => t.id === tab)?.label;
    content = {
      bausteine: (
        <BlocksPanel
          selectedBlockId={selectedBlockId}
          onAdded={(blockId) => {
            selectBlock(blockId);
            openElementPanel('details');
          }}
        />
      ),
      seite: <PagePanel selectedBlockId={selectedBlockId} onSelectBlock={selectBlock} />,
      design: <DesignPanel />,
      einstellungen: <SettingsPanel />,
      impressum: <LegalPanel />,
    }[tab];
  } else if (elementPanel !== null && selection !== null && blockType !== null) {
    title = elementPanel === 'image' ? 'Bild' : SITE_BLOCK_UI[blockType].label;
    content = <SelectionForm selection={selection} panel={elementPanel} />;
  }

  return (
    <SidebarPanel
      isOpen={content !== null}
      title={title}
      onClose={() => {
        openTab(null);
        openElementPanel(null);
      }}
    >
      {/* `.section-editor-panel`: focus inside keeps the field highlight (useFieldRegistry). */}
      {/* On a phone the sheet titles itself; the panel's own first heading would repeat it. */}
      <div className="section-editor-panel max-canvas-mobile:[&_.section-heading]:hidden">
        {content}
      </div>
    </SidebarPanel>
  );
}
