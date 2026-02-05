import { motion } from 'motion/react';
import React, { useEffect } from 'react';

import useSidebarStore from '../../../stores/sidebarStore';
import { ProfilbildCanvas } from '../canvas-editor';
import { ControllableCanvasWrapper } from '../canvas-editor/ControllableCanvasWrapper';
import { slideVariants } from '../components/StepFlow';
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

import type { DreizeilenAlternative } from '../canvas-editor/configs/dreizeilen.types';
import type { InitialPageDef } from '../canvas-editor/hooks/useHeterogeneousMultiPage';
import type { CanvasConfigId } from '../canvas-editor/configs/types';

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

export interface CanvasEditStepProps {
  typeConfig: CanvasEditTypeConfig | undefined;
  uploadedImageUrl: string | null;
  sloganAlternatives: SloganAlternative[];
  getFieldValue: (name: string) => unknown;
  handleCanvasExport: (base64: string) => void;
  handleCanvasSave: (base64: string) => void;
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
  handleCanvasSave,
  handleBack,
  transparentImage,
  currentStepId,
  direction,
  onHeadlineChange,
  onSubtextChange,
}) => {
  const requestHideSidebar = useSidebarStore((state) => state.requestHideSidebar);
  const releaseHideSidebar = useSidebarStore((state) => state.releaseHideSidebar);

  useEffect(() => {
    requestHideSidebar('canvas-edit-step');
    return () => releaseHideSidebar('canvas-edit-step');
  }, [requestHideSidebar, releaseHideSidebar]);

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

      {typeConfig?.id === IMAGE_STUDIO_TYPES.ZITAT_PURE && (
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
            type="zitat-pure"
            initialState={{
              quote: getFieldValue('quote') || '',
              name: getFieldValue('name') || '',
              alternatives: sloganAlternatives.map((alt: { quote?: string }) => alt.quote || ''),
            }}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.ZITAT && uploadedImageUrl && (
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
            type="zitat"
            initialState={{
              quote: getFieldValue('quote') || '',
              name: getFieldValue('name') || '',
              alternatives: sloganAlternatives.map((alt: { quote?: string }) => alt.quote || ''),
            }}
            imageSrc={uploadedImageUrl}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.INFO && (
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
            type="info"
            initialState={{
              header: getFieldValue('header') || '',
              body: getFieldValue('body') || '',
              alternatives: sloganAlternatives,
            }}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.VERANSTALTUNG && uploadedImageUrl && (
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
            type="veranstaltung"
            initialState={{
              eventTitle: getFieldValue('eventTitle') || '',
              beschreibung: getFieldValue('beschreibung') || '',
              weekday: getFieldValue('weekday') || '',
              date: getFieldValue('date') || '',
              time: getFieldValue('time') || '',
              locationName: getFieldValue('locationName') || '',
              address: getFieldValue('address') || '',
              alternatives: sloganAlternatives,
            }}
            imageSrc={uploadedImageUrl}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.DREIZEILEN && (
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
            type="dreizeilen"
            initialState={{
              line1: getFieldValue('line1') || '',
              line2: getFieldValue('line2') || '',
              line3: getFieldValue('line3') || '',
              alternatives: sloganAlternatives.filter(
                (alt): alt is DreizeilenAlternative =>
                  alt.line1 !== undefined && alt.line2 !== undefined && alt.line3 !== undefined
              ),
            }}
            imageSrc={uploadedImageUrl ?? undefined}
            onExport={handleCanvasExport}
            onCancel={handleBack}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.SIMPLE && uploadedImageUrl && (
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
            type="simple"
            initialState={{
              headline: getFieldValue('headline') || '',
              subtext: getFieldValue('subtext') || '',
              alternatives: sloganAlternatives,
            }}
            imageSrc={uploadedImageUrl}
            onExport={handleCanvasExport}
            onCancel={handleBack}
            onStateChange={(state: CanvasState) => {
              if (typeof state.headline === 'string') onHeadlineChange?.(state.headline);
              if (typeof state.subtext === 'string') onSubtextChange?.(state.subtext);
            }}
          />
        </motion.div>
      )}

      {typeConfig?.id === IMAGE_STUDIO_TYPES.SLIDER && (
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
            type="slider"
            initialState={{
              label: getFieldValue('label') || '',
              headline: getFieldValue('headline') || '',
              subtext: getFieldValue('subtext') || '',
              alternatives: sloganAlternatives,
            }}
            onExport={handleCanvasExport}
            onCancel={handleBack}
            initialPages={
              sloganAlternatives.length > 0
                ? [
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
                          slideVariant:
                            index < sloganAlternatives.length - 2 ? 'content' : 'last',
                        },
                      })
                    ),
                  ]
                : undefined
            }
          />
        </motion.div>
      )}
    </>
  );
};

export default CanvasEditStep;
