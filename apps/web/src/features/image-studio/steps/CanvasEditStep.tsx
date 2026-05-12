import { ControllableCanvasWrapper } from '@gruenerator/canvas-editor';
import { motion } from 'motion/react';
import React, { useEffect } from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { slideVariants } from '../components/StepFlow';
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

interface CanvasEditTypeConfig {
  id?: string;
  hasTextCanvasEdit?: boolean;
}

type CanvasState = Record<string, unknown>;

interface CanvasBlockConfig {
  canvasType: string;
  requiresImage?: boolean;
  optionalImage?: boolean;
  fields: string[];
  hasStateChange?: boolean;
}

const CANVAS_BLOCK_CONFIGS: Record<string, CanvasBlockConfig> = {
  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: {
    canvasType: 'zitat-pure',
    fields: ['quote', 'name'],
  },
  [IMAGE_STUDIO_TYPES.ZITAT]: {
    canvasType: 'zitat',
    requiresImage: true,
    fields: ['quote', 'name'],
  },
  [IMAGE_STUDIO_TYPES.INFO]: {
    canvasType: 'info',
    fields: ['header', 'body'],
  },
  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: {
    canvasType: 'veranstaltung',
    requiresImage: true,
    fields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
  },
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: {
    canvasType: 'dreizeilen',
    optionalImage: true,
    fields: ['line1', 'line2', 'line3'],
  },
  [IMAGE_STUDIO_TYPES.SIMPLE]: {
    canvasType: 'simple',
    requiresImage: true,
    fields: ['headline', 'subtext'],
    hasStateChange: true,
  },
  [IMAGE_STUDIO_TYPES.FREEFORM]: {
    canvasType: 'freeform',
    fields: [],
  },
  [IMAGE_STUDIO_TYPES.SLIDER]: {
    canvasType: 'slider',
    fields: ['label', 'headline', 'subtext'],
  },
  [IMAGE_STUDIO_TYPES.PROFILBILD]: {
    canvasType: 'profilbild',
    fields: [],
  },
};

function buildInitialState(
  config: CanvasBlockConfig,
  getFieldValue: (name: string) => unknown
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of config.fields) {
    state[field] = getFieldValue(field) || '';
  }
  return state;
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
  getFieldValue,
  handleCanvasExport,
  handleBack,
  transparentImage,
  currentStepId,
  direction,
  onHeadlineChange,
  onSubtextChange,
}) => {
  const editShareToken = useImageStudioStore((s) => s.editShareToken);
  console.log('[AutoSave][CanvasEditStep] render', {
    typeId: typeConfig?.id,
    editShareToken,
    galleryEditMode: useImageStudioStore.getState().galleryEditMode,
  });

  useEffect(() => {
    useSidebarStore.getState().requestHideSidebar('canvas');
    useSidebarStore.getState().requestHideHeader('canvas');
    return () => {
      useSidebarStore.getState().releaseHideSidebar('canvas');
      useSidebarStore.getState().releaseHideHeader('canvas');
    };
  }, []);

  const config = typeConfig?.id ? CANVAS_BLOCK_CONFIGS[typeConfig.id] : null;
  const isProfilbild = config?.canvasType === 'profilbild';
  const canvasImageSrc = isProfilbild
    ? (transparentImage ?? undefined)
    : config
      ? getImageSrc(config, uploadedImageUrl)
      : undefined;
  const canRender =
    config && (isProfilbild ? !!transparentImage : !(config.requiresImage && !uploadedImageUrl));

  return (
    <>
      {canRender && (
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
            initialState={buildInitialState(config, getFieldValue)}
            imageSrc={canvasImageSrc}
            onExport={handleCanvasExport}
            onCancel={handleBack}
            initialShareToken={editShareToken}
            onStateChange={
              config.hasStateChange
                ? (state: CanvasState) => {
                    if (typeof state.headline === 'string') onHeadlineChange?.(state.headline);
                    if (typeof state.subtext === 'string') onSubtextChange?.(state.subtext);
                  }
                : undefined
            }
          />
        </motion.div>
      )}
    </>
  );
};

export default CanvasEditStep;
