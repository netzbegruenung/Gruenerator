/**
 * Protokollizer Tab - Format extracted text into meeting minutes
 * Pre-fills with text from scanner and generates structured protocols
 */

import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { HiX } from 'react-icons/hi';
import { PiFileText, PiSparkle, PiArrowCounterClockwise } from 'react-icons/pi';

import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import { FormStateProvider } from '../../../components/common/Form/FormStateProvider';
import SubmitButton from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

type ProtokollTyp = 'sitzungsprotokoll' | 'ergebnisprotokoll' | 'verlaufsprotokoll';

interface ProtokollFormData {
  inputText: string;
  protokollTyp: ProtokollTyp;
  datum?: string;
  gremium?: string;
  ort?: string;
}

const PROTOKOLL_TYPES: { value: ProtokollTyp; label: string; description: string }[] = [
  {
    value: 'sitzungsprotokoll',
    label: 'Sitzungsprotokoll',
    description: 'Ausführliche Dokumentation mit Diskussionsverlauf',
  },
  {
    value: 'ergebnisprotokoll',
    label: 'Ergebnisprotokoll',
    description: 'Fokus auf Beschlüsse und Ergebnisse',
  },
  {
    value: 'verlaufsprotokoll',
    label: 'Verlaufsprotokoll',
    description: 'Chronologische Dokumentation aller Beiträge',
  },
];

const COMPONENT_NAME = 'protokoll';
const SCANNER_COMPONENT_NAME = 'scanner';

const ProtokollTab = () => {
  const [formData, setFormData] = useState<ProtokollFormData>({
    inputText: '',
    protokollTyp: 'sitzungsprotokoll',
    datum: '',
    gremium: '',
    ort: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);

  const getGeneratedText = useGeneratedTextStore((state) => state.getGeneratedText);
  const setGeneratedText = useGeneratedTextStore((state) => state.setGeneratedText);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  // Pre-fill input text from scanner when available
  useEffect(() => {
    const scannerText = getGeneratedText(SCANNER_COMPONENT_NAME);
    if (typeof scannerText === 'string' && scannerText && !formData.inputText) {
      setFormData((prev) => ({ ...prev, inputText: scannerText }));
    }
  }, [getGeneratedText, formData.inputText]);

  const handleInputChange = useCallback(
    (field: keyof ProtokollFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
        setError(null);
      },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.inputText.trim()) {
      setError('Bitte geben Sie einen Text ein oder scannen Sie ein Dokument.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/protokoll', {
        inputText: formData.inputText,
        protokollTyp: formData.protokollTyp,
        datum: formData.datum || undefined,
        gremium: formData.gremium || undefined,
        ort: formData.ort || undefined,
      });

      if (response.data.success && response.data.text) {
        setGeneratedText(COMPONENT_NAME, response.data.text, {
          title: `${PROTOKOLL_TYPES.find((t) => t.value === formData.protokollTyp)?.label || 'Protokoll'}`,
          contentType: 'protokoll',
        });
        setHasResult(true);
      } else {
        setError(response.data.error || 'Fehler bei der Protokollerstellung');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(
        error.response?.data?.error || error.message || 'Fehler bei der Protokollerstellung'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      inputText: '',
      protokollTyp: 'sitzungsprotokoll',
      datum: '',
      gremium: '',
      ort: '',
    });
    setHasResult(false);
    setError(null);
    clearGeneratedText(COMPONENT_NAME);
  };

  const handleLoadFromScanner = () => {
    const scannerText = getGeneratedText(SCANNER_COMPONENT_NAME);
    if (typeof scannerText === 'string' && scannerText) {
      setFormData((prev) => ({ ...prev, inputText: scannerText }));
    }
  };

  const scannerText = getGeneratedText(SCANNER_COMPONENT_NAME);
  const hasScannerText = typeof scannerText === 'string' && scannerText.length > 0;

  return (
    <div className="protokoll-tab-content">
      <AnimatePresence mode="wait">
        {!hasResult ? (
          <motion.form
            key="protokoll-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSubmit}
            className="protokoll-form"
          >
            {/* Input Text */}
            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="inputText" className="form-label">
                  Eingabetext *
                </label>
                {hasScannerText && formData.inputText !== scannerText && (
                  <button
                    type="button"
                    className="protokoll-load-scanner-btn"
                    onClick={handleLoadFromScanner}
                  >
                    <PiFileText />
                    <span>Aus Scanner laden</span>
                  </button>
                )}
              </div>
              <textarea
                id="inputText"
                value={formData.inputText}
                onChange={handleInputChange('inputText')}
                placeholder="Fügen Sie hier den Text ein, aus dem ein Protokoll erstellt werden soll..."
                className="form-textarea protokoll-textarea"
                rows={10}
                required
              />
              <p className="form-hint">
                Notizen, gescannte Dokumente oder Mitschriften der Sitzung
              </p>
            </div>

            {/* Protocol Type */}
            <div className="form-group">
              <label htmlFor="protokollTyp" className="form-label">
                Protokollart
              </label>
              <select
                id="protokollTyp"
                value={formData.protokollTyp}
                onChange={handleInputChange('protokollTyp')}
                className="form-select"
              >
                {PROTOKOLL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="form-hint">
                {PROTOKOLL_TYPES.find((t) => t.value === formData.protokollTyp)?.description}
              </p>
            </div>

            {/* Optional Fields Row */}
            <div className="protokoll-optional-fields">
              <div className="form-group">
                <label htmlFor="datum" className="form-label">
                  Datum
                </label>
                <input
                  type="date"
                  id="datum"
                  value={formData.datum}
                  onChange={handleInputChange('datum')}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="gremium" className="form-label">
                  Gremium
                </label>
                <input
                  type="text"
                  id="gremium"
                  value={formData.gremium}
                  onChange={handleInputChange('gremium')}
                  placeholder="z.B. Vorstand, OV Mitte"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="ort" className="form-label">
                  Ort
                </label>
                <input
                  type="text"
                  id="ort"
                  value={formData.ort}
                  onChange={handleInputChange('ort')}
                  placeholder="z.B. Kreisbüro, Online"
                  className="form-input"
                />
              </div>
            </div>

            <SubmitButton
              text={isLoading ? 'Protokoll wird erstellt...' : 'Protokoll erstellen'}
              loading={isLoading}
              icon={<PiSparkle />}
              type="submit"
              className="protokoll-submit-btn"
            />
          </motion.form>
        ) : (
          <motion.div
            key="protokoll-result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="protokoll-results-state"
          >
            <FormStateProvider>
              <DisplaySection
                title={`${PROTOKOLL_TYPES.find((t) => t.value === formData.protokollTyp)?.label || 'Protokoll'}`}
                componentName={COMPONENT_NAME}
                useMarkdown={true}
                showEditModeToggle={true}
                showUndoControls={true}
                showRedoControls={true}
              />
            </FormStateProvider>

            <button className="protokoll-new-btn" onClick={handleReset} type="button">
              <PiArrowCounterClockwise />
              <span>Neues Protokoll erstellen</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="alert"
            aria-live="assertive"
            className="form-error-message protokoll-error"
          >
            <span className="error-message-text">{error}</span>
            <button
              type="button"
              className="error-dismiss-button"
              onClick={() => setError(null)}
              aria-label="Fehlermeldung schließen"
            >
              <HiX size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProtokollTab;
