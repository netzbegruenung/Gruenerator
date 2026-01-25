import { FaShare } from 'react-icons/fa';
import { HiSparkles, HiPhotograph } from 'react-icons/hi';
import { PiSquaresFourFill } from 'react-icons/pi';

import { BalkenIcon } from '../icons';
import {
  DreizeilenPositionSection,
  AlternativesSection,
  AssetsSection,
  ImageBackgroundSection,
  GenericShareSection,
} from '../sidebar';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import { COLOR_SCHEMES, getColorScheme } from '../utils/dreizeilenLayout';

import type { DreizeilenAlternative } from './dreizeilen.types';
import type { CanvasConfig, AdditionalText } from './types';
import type { StockImageAttribution } from '../../services/imageSourceService';
import type { DreizeilenState } from '../composed/DreizeilenCanvas';
import type { ShapeInstance, ShapeType } from '../utils/shapes';


// Types for actions
interface DreizeilenActions {
  setLine1: (val: string) => void;
  setLine2: (val: string) => void;
  setLine3: (val: string) => void;
  setFontSize: (val: number) => void;
  setColorSchemeId: (val: string) => void;
  setBalkenWidthScale: (val: number) => void;
  setBarOffsets: (offsets: [number, number, number]) => void;
  setSunflowerVisible: (visible: boolean) => void;
  setCurrentImageSrc: (src: string) => void;
  setImageScale: (scale: number) => void;
  setImageAttribution?: (attribution: StockImageAttribution | null) => void;
  handleReset: () => void;
  handleSelectAlternative: (alt: DreizeilenAlternative) => void;
  handleAssetToggle: (id: string, visible: boolean) => void;
  toggleIcon: (id: string, selected: boolean) => void;
  addShape: (type: ShapeType) => void;
  // Additional Texts
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;
}

export const dreizeilenConfig: CanvasConfig<DreizeilenState, DreizeilenActions> = {
  tabs: [
    {
      id: 'image-background',
      icon: HiPhotograph,
      label: 'Hintergrund',
      ariaLabel: 'Hintergrundbild ändern',
    },
    { id: 'position', icon: BalkenIcon, label: 'Balken', ariaLabel: 'Balken-Einstellungen' },
    { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Sonnenblume ein/aus' },
    { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
    { id: 'share', icon: FaShare, label: 'Teilen', ariaLabel: 'Bild teilen' },
  ],
  sections: {
    position: {
      component: DreizeilenPositionSection,
      propsFactory: (state, actions: DreizeilenActions) => ({
        widthScale: state.balkenWidthScale,
        onWidthScaleChange: actions.setBalkenWidthScale,
        barOffsets: state.barOffsets,
        onBarOffsetChange: (_index: number, offset: number) => {
          const newOffsets = [...state.barOffsets];
          newOffsets[_index] = offset;
          actions.setBarOffsets(newOffsets as [number, number, number]);
        },
        colorScheme: getColorScheme(state.colorSchemeId),
        colorSchemes: COLOR_SCHEMES,
        activeSchemeId: state.colorSchemeId,
        onSchemeChange: actions.setColorSchemeId,
        onReset: actions.handleReset,
      }),
    },
    assets: {
      component: AssetsSection,
      propsFactory: (state, actions: DreizeilenActions) => ({
        // Text creation callbacks
        onAddHeader: actions.addHeader,
        onAddText: actions.addText,

        assets: ALL_ASSETS.map((asset) => ({
          ...asset,
          visible: asset.id === 'sunflower' ? state.sunflowerVisible : false,
        })),
        onAssetToggle: actions.handleAssetToggle,
        recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],
        selectedIcons: state.selectedIcons || [],
        onIconToggle: actions.toggleIcon,
        onAddShape: actions.addShape,
      }),
    },
    alternatives: {
      component: AlternativesSection,
      propsFactory: (state, actions: DreizeilenActions) => ({
        alternatives: [],
        currentLine1: state.line1,
        currentLine2: state.line2,
        currentLine3: state.line3,
        onSelectAlternative: actions.handleSelectAlternative,
      }),
    },
    'image-background': {
      component: ImageBackgroundSection,
      propsFactory: (state, actions: DreizeilenActions) => ({
        currentImageSrc: state.currentImageSrc,
        onImageChange: (
          _: File | null,
          url?: string,
          attribution?: StockImageAttribution | null
        ) => {
          if (url) actions.setCurrentImageSrc(url);
          if (attribution !== undefined) actions.setImageAttribution?.(attribution);
        },
        scale: state.imageScale,
        onScaleChange: actions.setImageScale,
      }),
    },
    share: {
      component: GenericShareSection,
      propsFactory: (state, actions: DreizeilenActions, shareProps) => {
        // Extract text from Dreizeilen canvas state
        const canvasText = `${state.line1}\n${state.line2}\n${state.line3}`.trim();

        // Note: autoSaveStatus removed - DownloadSubsection reads directly from useAutoSaveStore
        const props = {
          exportedImage: shareProps?.exportedImage || null,
          shareToken: shareProps?.shareToken || null,
          onCaptureCanvas:
            shareProps?.onCaptureCanvas ||
            (() => {
              console.error(
                '[dreizeilen.config] onCaptureCanvas fallback called - shareProps missing!'
              );
            }),
          onDownload: shareProps?.onDownload || (() => {}),
          onNavigateToGallery: shareProps?.onNavigateToGallery || (() => {}),
          canvasText,
          canvasType: 'dreizeilen',
        };

        return props;
      },
    },
  },
  getDisabledTabs: () => [],
};
