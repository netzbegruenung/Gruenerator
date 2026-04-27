import { HiArrowUpTray, HiChatBubbleLeftRight } from 'react-icons/hi2';

import { applyOperation, type CanvasAiActionsBase } from '../ai/applyOperation';
import { ChatSection, UploadsSection } from '../sidebar/sections';
import { buildSharepicText } from './buildSharepicText';

import type { CanvasAiEditBridge } from '../CanvasEditorProvider';
import type { TemplateAiCapabilities } from '../ai/types';
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
 * Creates a section entry for the in-canvas chat. The chat UI itself is
 * supplied by the host app via `CanvasEditorServices.ChatSectionContent` and
 * renders inline inside the sidebar panel.
 *
 * If a template's `TemplateAiCapabilities` is supplied, the section also
 * exposes a `CanvasAiEditBridge` so the host can drive `/api/canvas/ai-suggest`
 * + `applyOperation` without seeing the template's generic state/actions.
 */
export function createChatSection<TState, TActions extends CanvasAiActionsBase>(
  canvasType: string,
  capabilities?: TemplateAiCapabilities<TState, TActions>
) {
  return {
    component: ChatSection as unknown as React.ComponentType<Record<string, unknown>>,
    propsFactory: (
      state: TState,
      actions: TActions,
      context?: { captureCanvasImage?: () => Promise<string | null> }
    ): ChatSectionProps => {
      const aiEdit: CanvasAiEditBridge | undefined = capabilities
        ? {
            capabilityList: {
              supportedOperations: capabilities.supportedOperations,
              colorSchemes: capabilities.colorSchemes ?? null,
              illustrations: capabilities.illustrations ?? null,
              assets: capabilities.assets ?? null,
            },
            getSnapshot: () => capabilities.describeForAi(state),
            applyOperations: (ops) =>
              ops.map((op) => applyOperation(op, actions, () => state, capabilities)),
          }
        : undefined;

      return {
        canvasType,
        getSharepicText: () => buildSharepicText(state as Record<string, unknown>),
        captureCanvasImage: context?.captureCanvasImage,
        aiEdit,
      };
    },
  };
}
