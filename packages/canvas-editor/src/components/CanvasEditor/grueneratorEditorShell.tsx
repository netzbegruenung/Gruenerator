/**
 * The Grünerator's part of the editor shell: the „Vorlagen" tab and, around
 * the editor, its blocks and the idle warm-ups of the Elemente and Tools tabs.
 * The shell (`./index.tsx`) imports this file for its side effect, so every
 * program that renders the editor has them installed.
 */
import {
  registerEditorShell,
  type EditorShellProviderProps,
  type EditorTabSectionProps,
} from '@ggraphic/editor/components/CanvasEditor/editorShell';

import { usePreloadElements, usePreloadTools } from '../../sidebar/sections/preloadElements';
import { VorlagenSection } from '../../sidebar/sections/VorlagenSection';

import { BlockInsertProvider } from './blockInsert';
import { formatHasVorlagen, vorlagenTab, vorlagenTabIndex } from './vorlagenTab';

function GrueneratorVorlagenSection(props: EditorTabSectionProps) {
  // A deck takes the slide layouts of its first page's country.
  const layoutLocale = props.pages[0]?.configId === 'freeform-at' ? 'de-AT' : 'de-DE';
  return <VorlagenSection {...props} layoutLocale={layoutLocale} />;
}

function GrueneratorEditorProvider({
  configTabIds,
  children,
  ...blocks
}: EditorShellProviderProps) {
  usePreloadElements(configTabIds.some((id) => id === 'elements' || id === 'assets'));
  usePreloadTools(configTabIds.includes('tools'));
  return <BlockInsertProvider {...blocks}>{children}</BlockInsertProvider>;
}

registerEditorShell({
  tabs: [
    {
      tab: vorlagenTab,
      insertAt: vorlagenTabIndex,
      // The Vorlagen tab changes the deck, so it needs the synced pages doc (the shell checks it).
      isAvailable: ({ services, formatId }) =>
        services.vorlagen !== undefined && formatHasVorlagen(formatId),
      takesPageDrops: true,
      Section: GrueneratorVorlagenSection,
    },
  ],
  Provider: GrueneratorEditorProvider,
});
