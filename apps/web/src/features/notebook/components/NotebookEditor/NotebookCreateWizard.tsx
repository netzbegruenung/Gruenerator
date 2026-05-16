import { MultiStepForm } from '@gruenerator/ui';
import { AnimatePresence, motion } from 'motion/react';

import DetailsStep from './DetailsStep';
import ReviewStep from './ReviewStep';
import SourcesStep from './SourcesStep';
import VisibilityStep from './VisibilityStep';
import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface NotebookCreateWizardProps {
  state: NotebookEditorStateBundle;
}

export default function NotebookCreateWizard({ state }: NotebookCreateWizardProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="mx-auto w-full max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <MultiStepForm currentStep={state.step} onBack={state.handleBack}>
              <MultiStepForm.Step title="Quellen" subtitle="Woher kommen deine Dokumente?">
                <SourcesStep state={state} />
              </MultiStepForm.Step>
              <MultiStepForm.Step title="Details" subtitle="Wie soll dein Notebook heißen?">
                <DetailsStep state={state} />
              </MultiStepForm.Step>
              <MultiStepForm.Step title="Sichtbarkeit" subtitle="Wer darf dein Notebook sehen?">
                <VisibilityStep state={state} />
              </MultiStepForm.Step>
              <MultiStepForm.Step title="Überprüfen" subtitle="Alles bereit zum Erstellen?">
                <ReviewStep state={state} />
              </MultiStepForm.Step>
            </MultiStepForm>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
