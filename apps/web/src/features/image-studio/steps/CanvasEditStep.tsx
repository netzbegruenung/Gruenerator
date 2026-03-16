import {
  ProfilbildCanvas,
  ControllableCanvasWrapper,
  type CanvasConfigId,
  type DreizeilenAlternative,
  type InitialPageDef,
} from '@gruenerator/canvas-editor';
import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';

import useSidebarStore from '../../../stores/sidebarStore';
import { CanvasMobilePanel } from '../components/CanvasMobilePanel';
import { CanvasMobileSubsectionBar } from '../components/CanvasMobileSubsectionBar';
import { CanvasMobileTabBar } from '../components/CanvasMobileTabBar';
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
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );

  useEffect(() => {
    const handleResize = () => setIsDesktopViewport(window.innerWidth >= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    useSidebarStore.getState().setCanvasIsActive(true);
    return () => {
      useSidebarStore.getState().setCanvasIsActive(false);
    };
  }, []);

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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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

      {typeConfig?.id === IMAGE_STUDIO_TYPES.FREEFORM && (
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
            type="freeform"
            initialState={{}}
            onExport={handleCanvasExport}
            onCancel={handleBack}
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
            externalSidebar={true}
            externalMobileMode={!isDesktopViewport}
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
                          slideVariant: index < sloganAlternatives.length - 2 ? 'content' : 'last',
                        },
                      })
                    ),
                  ]
                : undefined
            }
          />
        </motion.div>
      )}

      {!isDesktopViewport && (
        <>
          <CanvasMobilePanel />
          <CanvasMobileSubsectionBar />
          <CanvasMobileTabBar />
        </>
      )}
    </>
  );
};

export default CanvasEditStep;
