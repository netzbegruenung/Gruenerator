import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { SIDEBAR_HINT } from '../sidebarStyles';

import type { CanvasAiEditBridge } from '../../CanvasEditorProvider';

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
}

export function ChatSection({
  canvasType,
  getSharepicText,
  captureCanvasImage,
  aiEdit,
}: ChatSectionProps) {
  const { ChatSectionContent } = useCanvasEditorServices();

  if (!ChatSectionContent) {
    return (
      <div className="flex flex-col gap-sm">
        <div className={SIDEBAR_HINT}>Chat ist in dieser Umgebung nicht verfügbar.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatSectionContent
        canvasType={canvasType}
        getSharepicText={getSharepicText}
        captureCanvasImage={captureCanvasImage}
        aiEdit={aiEdit}
      />
    </div>
  );
}
