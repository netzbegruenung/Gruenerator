import React from 'react';
import { motion } from 'motion/react';
import { ProfilbildCanvas, DreizeilenCanvas } from '../canvas-editor';
import { ControllableCanvasWrapper } from '../canvas-editor/ControllableCanvasWrapper';
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';
import { slideVariants } from '../components/StepFlow';

export interface CanvasEditStepProps {
    typeConfig: any;
    uploadedImageUrl: string | null;
    sloganAlternatives: any[];
    getFieldValue: (name: string) => any;
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
    onSubtextChange
}) => {
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
                        onSave={handleCanvasSave}
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
                    <DreizeilenCanvas
                        line1={getFieldValue('line1')}
                        line2={getFieldValue('line2')}
                        line3={getFieldValue('line3')}
                        imageSrc={uploadedImageUrl ?? undefined}
                        alternatives={sloganAlternatives}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
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
                        onStateChange={(state) => {
                            if (state.headline !== undefined) onHeadlineChange?.(state.headline);
                            if (state.subtext !== undefined) onSubtextChange?.(state.subtext);
                        }}
                    />
                </motion.div>
            )}
        </>
    );
};

export default CanvasEditStep;

