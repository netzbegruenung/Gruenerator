import React from 'react';
import { motion } from 'motion/react';
import { ProfilbildCanvas, ZitatPureCanvas, ZitatCanvas, InfoCanvas, VeranstaltungCanvas, DreizeilenCanvas, SimpleCanvas } from '../canvas-editor';
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
    direction
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
                    <ZitatPureCanvas
                        quote={getFieldValue('quote')}
                        name={getFieldValue('name')}
                        alternatives={sloganAlternatives.map((alt: { quote?: string }) => alt.quote || '')}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
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
                    <ZitatCanvas
                        quote={getFieldValue('quote')}
                        name={getFieldValue('name')}
                        imageSrc={uploadedImageUrl}
                        alternatives={sloganAlternatives.map((alt: { quote?: string }) => alt.quote || '')}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
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
                    <InfoCanvas
                        header={getFieldValue('header')}
                        subheader={getFieldValue('subheader')}
                        body={getFieldValue('body')}
                        alternatives={sloganAlternatives}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
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
                    <VeranstaltungCanvas
                        eventTitle={getFieldValue('eventTitle')}
                        beschreibung={getFieldValue('beschreibung')}
                        weekday={getFieldValue('weekday')}
                        date={getFieldValue('date')}
                        time={getFieldValue('time')}
                        locationName={getFieldValue('locationName')}
                        address={getFieldValue('address')}
                        imageSrc={uploadedImageUrl}
                        alternatives={sloganAlternatives}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
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
                    <SimpleCanvas
                        headline={getFieldValue('headline') || ''}
                        subtext={getFieldValue('subtext') || ''}
                        imageSrc={uploadedImageUrl}
                        onExport={handleCanvasExport}
                        onSave={handleCanvasSave}
                        onCancel={handleBack}
                    />
                </motion.div>
            )}
        </>
    );
};

export default CanvasEditStep;
