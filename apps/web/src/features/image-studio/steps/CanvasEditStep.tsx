import {
  ProfilbildCanvas,
  ControllableCanvasWrapper,
  type CanvasConfigId,
  type DreizeilenAlternative,
  type InitialPageDef,
} from '@gruenerator/canvas-editor';
import { motion } from 'motion/react';
import React, { useEffect } from 'react';

import useSidebarStore from '../../../stores/sidebarStore';
import { slideVariants } from '../components/StepFlow';
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

interface CanvasEditTypeConfig {
  id?: string;
  hasTextCanvasEdit?: boolean;
}

interface SloganAlternative {
  quote?: string;
  id?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  label?: string;
  headline?: string;
  subtext?: string;
}

type CanvasState = Record<string, unknown>;

interface CanvasBlockConfig {
  canvasType: string;
  requiresImage?: boolean;
  optionalImage?: boolean;
  fields: string[];
  alternativesMode: 'quote-strings' | 'full-objects' | 'dreizeilen-filter';
  hasStateChange?: boolean;
  hasInitialPages?: boolean;
}

const CANVAS_BLOCK_CONFIGS: Record<string, CanvasBlockConfig> = {
  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: {
    canvasType: 'zitat-pure',
    fields: ['quote', 'name'],
    alternativesMode: 'quote-strings',
  },
  [IMAGE_STUDIO_TYPES.ZITAT]: {
    canvasType: 'zitat',
    requiresImage: true,
    fields: ['quote', 'name'],
    alternativesMode: 'quote-strings',
  },
  [IMAGE_STUDIO_TYPES.INFO]: {
    canvasType: 'info',
    fields: ['header', 'body'],
    alternativesMode: 'full-objects',
  },
  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: {
    canvasType: 'veranstaltung',
    requiresImage: true,
    fields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
    alternativesMode: 'full-objects',
  },
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: {
    canvasType: 'dreizeilen',
    optionalImage: true,
    fields: ['line1', 'line2', 'line3'],
    alternativesMode: 'dreizeilen-filter',
  },
  [IMAGE_STUDIO_TYPES.SIMPLE]: {
    canvasType: 'simple',
    requiresImage: true,
    fields: ['headline', 'subtext'],
    alternativesMode: 'full-objects',
    hasStateChange: true,
  },
  [IMAGE_STUDIO_TYPES.FREEFORM]: {
    canvasType: 'freeform',
    fields: [],
    alternativesMode: 'full-objects',
  },
  [IMAGE_STUDIO_TYPES.SLIDER]: {
    canvasType: 'slider',
    fields: ['label', 'headline', 'subtext'],
    alternativesMode: 'full-objects',
    hasInitialPages: true,
  },
};

function buildInitialState(
  config: CanvasBlockConfig,
  getFieldValue: (name: string) => unknown,
  sloganAlternatives: SloganAlternative[]
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of config.fields) {
    state[field] = getFieldValue(field) || '';
  }
  switch (config.alternativesMode) {
    case 'quote-strings':
      state.alternatives = sloganAlternatives.map((alt) => alt.quote || '');
      break;
    case 'dreizeilen-filter':
      state.alternatives = sloganAlternatives.filter(
        (alt): alt is DreizeilenAlternative =>
          alt.line1 !== undefined && alt.line2 !== undefined && alt.line3 !== undefined
      );
      break;
    case 'full-objects':
      state.alternatives = sloganAlternatives;
      break;
  }
  return state;
}

function buildSliderPages(
  getFieldValue: (name: string) => unknown,
  sloganAlternatives: SloganAlternative[]
): InitialPageDef[] | undefined {
  if (sloganAlternatives.length === 0) return undefined;
  return [
    {
      configId: 'slider' as CanvasConfigId,
      state: {
        label: getFieldValue('label') || '',
        headline: getFieldValue('headline') || '',
        subtext: getFieldValue('subtext') || '',
        slideVariant: 'cover',
      },
    },
    ...sloganAlternatives.slice(1).map(
      (alt, index): InitialPageDef => ({
        configId: 'slider' as CanvasConfigId,
        state: {
          label: alt.label || 'Wusstest du?',
          headline: alt.headline || '',
          subtext: alt.subtext || '',
          slideVariant: index < sloganAlternatives.length - 2 ? 'content' : 'last',
        },
      })
    ),
  ];
}

function getImageSrc(
  config: CanvasBlockConfig,
  uploadedImageUrl: string | null
): string | undefined {
  if (config.requiresImage) return uploadedImageUrl!;
  if (config.optionalImage) return uploadedImageUrl ?? undefined;
  return undefined;
}

export interface CanvasEditStepProps {
  typeConfig: CanvasEditTypeConfig | undefined;
  uploadedImageUrl: string | null;
  sloganAlternatives: SloganAlternative[];
  getFieldValue: (name: string) => unknown;
  handleCanvasExport: (base64: string) => void;
  handleBack: () => void;
  transparentImage: string | null;
  currentStepId: string;
  direction: number;
  onHeadlineChange?: (headline: string) => void;
  onSubtextChange?: (subtext: string) => void;
}

const CanvasEditStep: React.FC<CanvasEditStepProps> = ({
  typeConfig,
  uploadedImageUrl,
  sloganAlternatives,
  getFieldValue,
  handleCanvasExport,
  handleBack,
  transparentImage,
  currentStepId,
  direction,
  onHeadlineChange,
  onSubtextChange,
}) => {
  useEffect(() => {
    useSidebarStore.getState().requestHideSidebar('canvas');
    return () => {
      useSidebarStore.getState().releaseHideSidebar('canvas');
    };
  }, []);

  const config = typeConfig?.id ? CANVAS_BLOCK_CONFIGS[typeConfig.id] : null;

  return (
    <>
      {transparentImage && !typeConfig?.hasTextCanvasEdit && (
        <motion.div
          key={currentStepId}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="typeform-field typeform-field--canvas-edit"
        >
          <ProfilbildCanvas
            transparentImage={transparentImage}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {config && !(config.requiresImage && !uploadedImageUrl) && (
        <motion.div
          key={currentStepId}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="typeform-field typeform-field--canvas-edit"
        >
          <ControllableCanvasWrapper
            externalSidebar={false}
            type={config.canvasType}
            initialState={buildInitialState(config, getFieldValue, sloganAlternatives)}
            imageSrc={getImageSrc(config, uploadedImageUrl)}
            onExport={handleCanvasExport}
            onCancel={handleBack}
            onStateChange={
              config.hasStateChange
                ? (state: CanvasState) => {
                    if (typeof state.headline === 'string') onHeadlineChange?.(state.headline);
                    if (typeof state.subtext === 'string') onSubtextChange?.(state.subtext);
                  }
                : undefined
            }
            initialPages={
              config.hasInitialPages
                ? buildSliderPages(getFieldValue, sloganAlternatives)
                : undefined
            }
          />
        </motion.div>
      )}
    </>
  );
};

export default CanvasEditStep;
