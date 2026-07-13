/**
 * Profilbild Canvas Configuration
 *
 * Solid-color background + draggable foreground avatar (transparent PNG).
 * No text fields. Supports background color picker + AI chat (set-background-color
 * for the canvas, update-element for repositioning/resizing the avatar).
 *
 * Replaces the legacy bespoke `ProfilbildCanvas.tsx` so all canvas templates
 * route through the FullCanvasConfig pipeline and gain `aiEdit` parity.
 */

import {
  CANVAS_COLORS,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CANVAS_SIZE,
  INITIAL_SCALE,
} from '@gruenerator/shared/canvas-editor';
import { HiPaintBrush } from 'react-icons/hi2';

import { createBaseActions } from './factory/actionFactories';
import { makeSectionDefiner } from './factory/defineSection';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from './commonSections';
import { BackgroundSection } from '../sidebar/sections';

import type { BaseCanvasState } from './factory/baseTypes';
import type {
  FullCanvasConfig,
  ImageElementConfig,
  LayoutResult,
  RectElementConfig,
} from './types';
import type { TemplateAiCapabilities } from '../ai/types';
import type { BackgroundColorOption } from '../sidebar/types';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_SIZE = DEFAULT_CANVAS_SIZE;
const AVATAR_ID = 'avatar';

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'tanne', label: 'Tanne', color: CANVAS_COLORS.TANNE },
  { id: 'klee', label: 'Klee', color: CANVAS_COLORS.KLEE },
  { id: 'sonne', label: 'Sonne', color: CANVAS_COLORS.SONNE },
  { id: 'himmel', label: 'Himmel', color: CANVAS_COLORS.HIMMEL },
  { id: 'sand', label: 'Sand', color: CANVAS_COLORS.SAND },
  { id: 'weiss', label: 'Weiß', color: CANVAS_COLORS.WHITE },
  { id: 'schwarz', label: 'Schwarz', color: CANVAS_COLORS.BLACK },
];

// ============================================================================
// STATE & ACTIONS
// ============================================================================

export interface ProfilbildFullState extends BaseCanvasState {
  transparentImage: string;
  backgroundColor: string;
  imagePosition: { x: number; y: number };
  imageSize: { w: number; h: number };
}

type BaseActions = ReturnType<typeof createBaseActions<ProfilbildFullState>>;

export interface ProfilbildFullActions extends BaseActions {
  setBackgroundColor: (color: string) => void;
  setImagePosition: (pos: { x: number; y: number }) => void;
  setImageSize: (size: { w: number; h: number }) => void;
  setTransparentImage: (src: string) => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

function defaultAvatarLayout(): {
  position: { x: number; y: number };
  size: { w: number; h: number };
} {
  // Center-bottom-anchored, mirroring the legacy ProfilbildCanvas default
  // before the user has dragged the avatar around.
  const dim = CANVAS_SIZE * INITIAL_SCALE;
  return {
    position: { x: (CANVAS_SIZE - dim) / 2, y: CANVAS_SIZE - dim },
    size: { w: dim, h: dim },
  };
}

function createProfilbildInitialState(props: Record<string, unknown>): ProfilbildFullState {
  const { position, size } = defaultAvatarLayout();
  const transparentImage = (props.transparentImage as string | undefined) ?? '';
  const backgroundColor = (props.backgroundColor as string | undefined) ?? DEFAULT_BACKGROUND_COLOR;

  return {
    isDesktop: true,
    assetInstances: [],
    selectedIcons: [],
    iconStates: {},
    shapeInstances: [],
    illustrationInstances: [],
    additionalTexts: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    balkenInstances: [],
    frameInstances: [],
    chartInstances: [],
    userImageInstances: [],
    transparentImage,
    backgroundColor,
    imagePosition: position,
    imageSize: size,
  };
}

// ============================================================================
// LAYOUT
// ============================================================================

const calculateLayout = (_state: ProfilbildFullState): LayoutResult => ({});

// ============================================================================
// ELEMENTS
// ============================================================================

const backgroundElement: RectElementConfig<ProfilbildFullState> = {
  id: 'background',
  type: 'rect',
  x: 0,
  y: 0,
  order: 0,
  width: CANVAS_SIZE,
  height: CANVAS_SIZE,
  fill: (state) => state.backgroundColor || DEFAULT_BACKGROUND_COLOR,
  listening: false,
};

const avatarElement: ImageElementConfig<ProfilbildFullState> = {
  id: AVATAR_ID,
  type: 'image',
  x: (state) => state.imagePosition.x,
  y: (state) => state.imagePosition.y,
  order: 1,
  srcKey: 'transparentImage',
  positionStateKey: 'imagePosition',
  sizeStateKey: 'imageSize',
  width: (state) => state.imageSize.w,
  height: (state) => state.imageSize.h,
  draggable: true,
  transformable: true,
};

// ============================================================================
// AI CAPABILITIES
// ============================================================================

const profilbildAiCapabilities: TemplateAiCapabilities<ProfilbildFullState, ProfilbildFullActions> =
  {
    supportedOperations: ['set-background-color', 'update-element'],

    describeForAi: (_state): CanvasAiSnapshot => ({
      template: 'profilbild',
      textFields: [],
      elementsSummary: [
        {
          id: AVATAR_ID,
          kind: 'user-image',
          label: 'Profilbild-Avatar (transparenter PNG-Vordergrund)',
        },
      ],
    }),

    applyOverrides: {
      'update-element': (op, actions, getState) => {
        if (op.elementId !== AVATAR_ID) {
          throw new Error(`Profilbild template kennt kein Element "${op.elementId}"`);
        }
        const patch = op.patch;
        if (patch.x != null && patch.y != null) {
          actions.setImagePosition({ x: patch.x, y: patch.y });
        }
        if (patch.scale != null && patch.scale > 0) {
          const current = getState().imageSize;
          actions.setImageSize({ w: current.w * patch.scale, h: current.h * patch.scale });
        }
      },
    },
  };

// ============================================================================
// CONFIG EXPORT
// ============================================================================

const section = makeSectionDefiner<ProfilbildFullState, ProfilbildFullActions>();

export const profilbildFullConfig: FullCanvasConfig<ProfilbildFullState, ProfilbildFullActions> = {
  id: 'profilbild',

  canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },

  multiPage: {
    enabled: true,
    maxPages: 10,
    heterogeneous: true,
    defaultNewPageState: {},
  },

  ai: profilbildAiCapabilities,

  tabs: [
    { id: 'background', icon: HiPaintBrush, label: 'Farbe', ariaLabel: 'Hintergrundfarbe' },
    toolsTab,
    uploadsTab,
    chatTab,
  ],

  getVisibleTabs: () => ['background', 'tools', 'uploads', 'chat'],

  sections: {
    background: section({
      component: BackgroundSection,
      propsFactory: (state, actions) => ({
        colors: BACKGROUND_COLORS,
        currentColor: state.backgroundColor,
        onColorChange: actions.setBackgroundColor,
      }),
    }),
    ...createCommonSectionEntries('profilbild', profilbildAiCapabilities),
  },

  elements: [backgroundElement, avatarElement],

  calculateLayout,

  createInitialState: createProfilbildInitialState,

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) => {
    const baseActions = createBaseActions<ProfilbildFullState>(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_SIZE,
      CANVAS_SIZE
    );

    return {
      ...baseActions,
      setBackgroundColor: (color: string) => {
        setState({ backgroundColor: color });
        debouncedSaveToHistory(getState());
      },
      setImagePosition: (pos) => {
        setState({ imagePosition: pos });
        debouncedSaveToHistory(getState());
      },
      setImageSize: (size) => {
        setState({ imageSize: size });
        debouncedSaveToHistory(getState());
      },
      setTransparentImage: (src) => {
        setState({ transparentImage: src });
        saveToHistory(getState());
      },
    };
  },
};
