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

export function ChatSection({
  canvasType,
  getSharepicText,
  captureCanvasImage,
  aiEdit,
  specEdit,
}: ChatSectionProps) {
  const { ChatSectionContent, userLocale = 'de-DE' } = useCanvasEditorServices();
  const localeAiEdit = useMemo(() => {
    const assets = aiEdit?.capabilityList.assets;
    if (!aiEdit || !assets) return aiEdit;
    return {
      ...aiEdit,
      capabilityList: {
        ...aiEdit.capabilityList,
        assets: filterAssetOptionsForLocale(assets, userLocale),
      },
    };
  }, [aiEdit, userLocale]);

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
        specEdit={specEdit}
      />
    </div>
  );
}
