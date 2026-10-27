import { useAnnounce } from '@ggraphic/editor/hooks/useAnnounce';
import { useMemo } from 'react';

import { filterAssetOptionsForLocale } from '../../ai/assetCapability';
import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { SIDEBAR_HINT } from '../sidebarStyles';

import type { CanvasAiEditBridge, CanvasSpecEditBridge } from '../../CanvasEditorProvider';

export interface ChatSectionProps {
  /** Canvas template id (e.g. 'zitat', 'simple'). */
  canvasType: string;
  /** Returns a structured text description of the current canvas content. */
  getSharepicText: () => string;
  /** Captures the current canvas as a PNG data URL (or null if not ready). */
  captureCanvasImage?: () => Promise<string | null>;
  /** Bridge for canvas-AI edit operations. Present only when the template
   *  declares AI capabilities. */
  aiEdit?: CanvasAiEditBridge;
  specEdit?: CanvasSpecEditBridge;
}

/** Der Chat setzt das Banner selbst; Screenreader erfahren hier, dass etwas geändert wurde. */
export const AI_EDIT_APPLIED = 'KI-Änderung angewendet. Behalten oder verwerfen über das Banner.';

export function ChatSection({
  canvasType,
  getSharepicText,
  captureCanvasImage,
  aiEdit,
  specEdit,
}: ChatSectionProps) {
  const { ChatSectionContent, userLocale = 'de-DE' } = useCanvasEditorServices();
  const announce = useAnnounce();
  // Einmal je Stapel, nur wenn mindestens eine Operation griff.
  const localeAiEdit = useMemo<CanvasAiEditBridge | undefined>(() => {
    if (!aiEdit) return aiEdit;
    const assets = aiEdit.capabilityList.assets;
    return {
      ...aiEdit,
      capabilityList: assets
        ? {
            ...aiEdit.capabilityList,
            assets: filterAssetOptionsForLocale(assets, userLocale),
          }
        : aiEdit.capabilityList,
      applyOperations: (ops) => {
        const results = aiEdit.applyOperations(ops);
        if (results.some((result) => result.ok)) announce(AI_EDIT_APPLIED);
        return results;
      },
    };
  }, [aiEdit, userLocale, announce]);
  const announcingSpecEdit = useMemo<CanvasSpecEditBridge | undefined>(
    () =>
      specEdit && {
        ...specEdit,
        replaceDeck: (ops) => {
          const ids = specEdit.replaceDeck(ops);
          if (ops.updates.length + ops.inserts.length + ops.removes.length > 0) {
            announce(AI_EDIT_APPLIED);
          }
          return ids;
        },
      },
    [specEdit, announce]
  );

  if (!ChatSectionContent) {
    return (
      <div className="flex flex-col gap-sm">
        <div className={SIDEBAR_HINT}>Chat ist in dieser Umgebung nicht verfügbar.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col max-canvas-mobile:flex-1" data-tour="canvas-chat">
      <ChatSectionContent
        canvasType={canvasType}
        getSharepicText={getSharepicText}
        captureCanvasImage={captureCanvasImage}
        aiEdit={localeAiEdit}
        specEdit={announcingSpecEdit}
      />
    </div>
  );
}
