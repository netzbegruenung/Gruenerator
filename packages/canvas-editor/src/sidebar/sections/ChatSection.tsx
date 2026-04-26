import { HiChatBubbleLeftRight } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { SIDEBAR_HINT, SIDEBAR_SECTION } from '../primitives';

export interface ChatSectionProps {
  /** Canvas template id (e.g. 'zitat', 'simple'). */
  canvasType: string;
  /** Returns a structured text description of the current canvas content. */
  getSharepicText: () => string;
}

export function ChatSection({ canvasType, getSharepicText }: ChatSectionProps) {
  const services = useCanvasEditorServices();

  if (!services.openChat) {
    return (
      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_HINT}>Chat ist in dieser Umgebung nicht verfügbar.</div>
      </div>
    );
  }

  const handleOpen = () => {
    services.openChat?.({ canvasType, getSharepicText });
  };

  return (
    <div className={SIDEBAR_SECTION}>
      <p className={SIDEBAR_HINT}>
        Diskutiere dein Sharepic mit der KI. Du kannst den aktuellen Inhalt mit einem Klick in den
        Chat einfügen.
      </p>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center justify-center gap-sm rounded-[var(--card-border-radius-small)] bg-primary px-md py-sm text-sm font-medium text-white transition-colors hover:bg-primary-700"
      >
        <HiChatBubbleLeftRight className="size-4" aria-hidden="true" />
        Chat öffnen
      </button>
    </div>
  );
}
