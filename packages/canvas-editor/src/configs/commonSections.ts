import { HiArrowUpTray, HiChatBubbleLeftRight, HiWrenchScrewdriver } from 'react-icons/hi2';

import { applyOperation, type CanvasAiActionsBase } from '../ai/applyOperation';
import { ChatSection, ToolsSection, UploadsSection } from '../sidebar/sections';
import { ChartSettingsSection } from '../sidebar/sections/ChartSettingsSection';
import { ImageAdjustSection } from '../sidebar/sections/ImageAdjustSection';
import { buildSharepicText } from './buildSharepicText';
import { makeSectionDefiner } from './factory/defineSection';

import type { CanvasAiEditBridge } from '../CanvasEditorProvider';
import type { TemplateAiCapabilities } from '../ai/types';
import type { ChatSectionProps, ToolsSectionProps, UploadsSectionProps } from '../sidebar/sections';
import type { SidebarTab } from '../sidebar/types';
import type { ChartInstance, ChartType } from '../utils/chartUtils';
import type { UserImageInstance } from '../utils/userImageUtils';

interface ActionsWithChart {
  addChart?: (chartType: ChartType) => void;
  updateChart?: (id: string, partial: Partial<ChartInstance>) => void;
  removeChart?: (id: string) => void;
  addUserImageFromUrl?: (url: string, fileName: string) => void;
}

interface ActionsWithUserImage {
  updateUserImage?: (id: string, partial: Partial<UserImageInstance>) => void;
}

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
  propsFactory: (_state, actions): ToolsSectionProps => {
    const a = actions as ActionsWithChart;
    const props: ToolsSectionProps = {};
    if (a.addChart) props.onInsertChart = a.addChart;
    // Tools place their generated image straight onto the canvas (durable URL).
    if (a.addUserImageFromUrl) props.onPlaceImageUrl = a.addUserImageFromUrl;
    return props;
  },
});

/**
 * Shared settings panel for a selected chart element. Rendered when
 * `activeTab === 'chart-settings'` (configs auto-switch to it on `chart-*`
 * selection). Reads the selected chart straight from state + the chart actions,
 * exactly like each config's `frame-settings` entry.
 */
export const chartSettingsSectionEntry = defineCommonSection({
  component: ChartSettingsSection,
  propsFactory: (state, actions, context) => {
    const s = state as { chartInstances?: ChartInstance[] };
    const a = actions as ActionsWithChart;
    const selectedId = (context as { selectedElement?: string | null } | undefined)
      ?.selectedElement;
    const selectedChart = selectedId
      ? (s.chartInstances?.find((c) => c.id === selectedId) ?? null)
      : null;
    return {
      selectedChart,
      onUpdateChart: a.updateChart ?? (() => {}),
      onRemoveChart: a.removeChart ?? (() => {}),
    };
  },
});

/**
 * Shared image-adjust ("Bearbeiten") panel. Opened explicitly from the context
 * bar's Bearbeiten button (setActiveTab('image-adjust')), not on selection.
 */
export const imageAdjustSectionEntry = defineCommonSection({
  component: ImageAdjustSection,
  propsFactory: (state, actions, context) => {
    const s = state as { userImageInstances?: UserImageInstance[] };
    const a = actions as ActionsWithUserImage;
    const selectedId = (context as { selectedElement?: string | null } | undefined)
      ?.selectedElement;
    const selectedImage = selectedId
      ? (s.userImageInstances?.find((u) => u.id === selectedId) ?? null)
      : null;
    return {
      selectedImage,
      onUpdateImage: a.updateUserImage ?? (() => {}),
    };
  },
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
    'chart-settings': chartSettingsSectionEntry,
    'image-adjust': imageAdjustSectionEntry,
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
