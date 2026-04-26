import { HiArrowUpTray, HiChatBubbleLeftRight } from 'react-icons/hi2';

import { ChatSection, UploadsSection } from '../sidebar/sections';
import { buildSharepicText } from './buildSharepicText';

import type { ChatSectionProps, UploadsSectionProps } from '../sidebar/sections';
import type { SidebarTab } from '../sidebar/types';

export const uploadsTab: SidebarTab = {
  id: 'uploads',
  icon: HiArrowUpTray,
  label: 'Uploads',
  ariaLabel: 'Eigene Bilder hochladen',
};

interface ActionsWithUploads {
  addUserImageFromUrl?: (url: string, fileName: string) => void;
}

export const uploadsSectionEntry = {
  component: UploadsSection as unknown as React.ComponentType<Record<string, unknown>>,
  propsFactory: (_state: unknown, actions: unknown): UploadsSectionProps => {
    const a = actions as ActionsWithUploads;
    return a.addUserImageFromUrl ? { onPlaceFromUrl: a.addUserImageFromUrl } : {};
  },
};

export const chatTab: SidebarTab = {
  id: 'chat',
  icon: HiChatBubbleLeftRight,
  label: 'Chat',
  ariaLabel: 'KI-Chat zum aktuellen Sharepic öffnen',
};

/**
 * Creates a section entry for the in-canvas chat. The actual chat modal is
 * rendered by the host app via `CanvasEditorServices.openChat`; this entry
 * only renders the trigger button. `getSharepicText` is rebuilt on each call
 * so the chat always sees the latest canvas content.
 */
export function createChatSection(canvasType: string) {
  return {
    component: ChatSection as unknown as React.ComponentType<Record<string, unknown>>,
    propsFactory: (state: unknown): ChatSectionProps => ({
      canvasType,
      getSharepicText: () => buildSharepicText(state as Record<string, unknown>),
    }),
  };
}
