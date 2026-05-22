import { HiArrowUpTray, HiChatBubbleLeftRight, HiWrenchScrewdriver } from 'react-icons/hi2';

import { applyOperation, type CanvasAiActionsBase } from '../ai/applyOperation';
import { ChatSection, ToolsSection, UploadsSection } from '../sidebar/sections';
import { buildSharepicText } from './buildSharepicText';
import { makeSectionDefiner } from './factory/defineSection';

import type { CanvasAiEditBridge } from '../CanvasEditorProvider';
import type { TemplateAiCapabilities } from '../ai/types';
import type { ChatSectionProps, ToolsSectionProps, UploadsSectionProps } from '../sidebar/sections';
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

/**
 * The tools/uploads entries are config-agnostic (shared verbatim across every
 * template), so they bind their definer to `unknown` state/actions. The
 * resulting `SectionConfig<unknown, unknown, …>` still slots into a template's
 * `Record<string, SectionConfig<TState, TActions, …>>` via function-param
 * contravariance — a factory accepting `unknown` is assignable where one
 * accepting the template's `TState` is expected.
 */
const defineCommonSection = makeSectionDefiner<unknown, unknown>();

export const uploadsSectionEntry = defineCommonSection({
  component: UploadsSection,
  propsFactory: (_state, actions): UploadsSectionProps => {
    const a = actions as ActionsWithUploads;
    return a.addUserImageFromUrl ? { onPlaceFromUrl: a.addUserImageFromUrl } : {};
  },
});

export const toolsTab: SidebarTab = {
  id: 'tools',
  icon: HiWrenchScrewdriver,
  label: 'Tools',
  ariaLabel: 'KI-Bildwerkzeuge',
};

export const toolsSectionEntry = defineCommonSection({
  component: ToolsSection,
  propsFactory: (): ToolsSectionProps => ({}),
});

export const chatTab: SidebarTab = {
  id: 'chat',
  icon: HiChatBubbleLeftRight,
  label: 'Chat',
  ariaLabel: 'KI-Chat zum aktuellen Sharepic öffnen',
};

/**
 * Bundles the three universally-shared section entries (tools, uploads, chat).
 *
 * Every config that uses all three gets the same 3-line spread; using this
 * helper centralizes the wiring so adding a new common section (e.g. a
 * future `share` or `assets` registry entry) only requires editing this file.
 */
export function createCommonSectionEntries<TState, TActions extends CanvasAiActionsBase>(
  canvasType: string,
  capabilities?: TemplateAiCapabilities<TState, TActions>
) {
  return {
    tools: toolsSectionEntry,
    uploads: uploadsSectionEntry,
    chat: createChatSection(canvasType, capabilities),
  };
}

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
  const defineSection = makeSectionDefiner<TState, TActions>();
  return defineSection({
    component: ChatSection,
    propsFactory: (state, actions, context): ChatSectionProps => {
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
        captureCanvasImage: context?.captureCanvasImageForAi ?? context?.captureCanvasImage,
        aiEdit,
      };
    },
  });
}
