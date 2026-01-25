import { motion, AnimatePresence } from 'motion/react';
import React, { useCallback } from 'react';
import { FaTimes, FaChevronDown, FaExchangeAlt, FaImage, FaRedo } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi';

import {
  ColorSchemeControl,
  FontSizeControl,
  InputWithFontSize,
  CreditControl,
  BalkenOffsetControl,
  BalkenGruppeControl,
  SonnenblumenControl,
} from '../../../components/utils/ImageModificationForm';

import ConfigDrivenFields from './ConfigDrivenFields';

import type {
  TemplateResultEditPanelProps,
  SloganAlternativeWithIndex,
} from '../types/templateResultTypes';
import './EditPanel.css';

export const EditPanel: React.FC<TemplateResultEditPanelProps> = ({
  isOpen,
  onClose,
  fieldConfig,
  currentImagePreview,
  fileInputRef,
  handleImageChange,
  previewValues,
  handleChange,
  displayAlternatives,
  isAlternativesOpen,
  setIsAlternativesOpen,
  handleSloganSwitch,
  getAlternativePreview,
  credit,
  fontSize,
  colorScheme,
  balkenOffset,
  balkenGruppenOffset,
  sunflowerOffset,
  veranstaltungFieldFontSizes,
  handleControlChange,
  handleFieldFontSizeChange,
  isAdvancedEditingOpen,
  toggleAdvancedEditing,
  type,
  loading,
  onRegenerate,
  onGenerateAlternatives,
  alternativesLoading,
}) => {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="edit-panel-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      />
      <motion.div
        className="edit-panel"
        initial={isDesktop ? { x: '100%' } : { y: '100%' }}
        animate={isDesktop ? { x: 0 } : { y: 0 }}
        exit={isDesktop ? { x: '100%' } : { y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="edit-panel__header">
          <h3 className="edit-panel__title">Bild bearbeiten</h3>
          <button className="edit-panel__close" onClick={onClose} aria-label="Panel schließen">
            <FaTimes />
          </button>
        </div>

        <div className="edit-panel__content">
          {fieldConfig?.showImageUpload && (
            <div className="edit-panel__section">
              <h4>Hintergrundbild</h4>
              <div className="image-change-control">
                <div className="image-change-preview">
                  {currentImagePreview ? (
                    <img src={currentImagePreview} alt="Aktuelles Bild" />
                  ) : (
                    <div className="image-change-placeholder">
                      <FaImage />
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                <button
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  type="button"
                >
                  <FaImage />
                  Bild ändern
                </button>
              </div>
            </div>
          )}

          <div className="edit-panel__section">
            <h4>Text</h4>
            {fieldConfig?.showGroupedFontSizeControl ? (
              <div className="veranstaltung-fields-with-fontsize">
                {(fieldConfig?.previewFields || []).map((field) => {
                  const baseFontSizes: Record<string, number> = {
                    eventTitle: 94,
                    beschreibung: 62,
                    weekday: 57,
                    date: 55,
                    time: 55,
                    locationName: 42,
                    address: 42,
                  };
                  const base = baseFontSizes[field.name] || 60;
                  return (
                    <InputWithFontSize
                      key={field.name}
                      label={field.label}
                      name={field.name}
                      value={previewValues[field.name] || ''}
                      onChange={handleChange}
                      fontSizePx={
                        veranstaltungFieldFontSizes?.[
                          field.name as keyof typeof veranstaltungFieldFontSizes
                        ] || base
                      }
                      baseFontSize={base}
                      onFontSizeChange={handleFieldFontSizeChange}
                      placeholder={field.placeholder || ''}
                      disabled={loading}
                    />
                  );
                })}
              </div>
            ) : (
              <ConfigDrivenFields
                fields={fieldConfig?.previewFields || []}
                values={previewValues}
                onChange={handleChange}
                disabled={loading}
                hideLabels={!fieldConfig?.showPreviewLabels}
              />
            )}
          </div>

          {fieldConfig?.showAlternatives && (
            <div className="edit-panel__section">
              {displayAlternatives.length === 0 ? (
                <button
                  className="btn-secondary edit-panel__generate-alternatives"
                  onClick={onGenerateAlternatives}
                  disabled={loading || alternativesLoading}
                  type="button"
                >
                  {alternativesLoading ? <div className="button-spinner" /> : <HiSparkles />}
                  Mehr Alternativen generieren
                </button>
              ) : (
                <>
                  <button
                    className={`edit-panel__section-toggle ${isAlternativesOpen ? 'edit-panel__section-toggle--open' : ''}`}
                    onClick={() => setIsAlternativesOpen(!isAlternativesOpen)}
                    type="button"
                  >
                    <FaExchangeAlt />
                    Text-Alternativen ({displayAlternatives.length})
                    <FaChevronDown />
                  </button>

                  <AnimatePresence>
                    {isAlternativesOpen && (
                      <motion.div
                        className="edit-panel__alternatives"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="alternatives-pills">
                          {displayAlternatives.map((alt) => (
                            <button
                              key={alt._index}
                              className="alternative-pill"
                              onClick={() => handleSloganSwitch(alt, alt._index)}
                              disabled={loading}
                              type="button"
                            >
                              {getAlternativePreview(alt)}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          )}

          {(fieldConfig?.showCredit ||
            (fieldConfig?.showFontSizeControl && !fieldConfig?.showGroupedFontSizeControl)) && (
            <div className="edit-panel__row">
              {fieldConfig?.showCredit && (
                <div className="edit-panel__section edit-panel__section--flex">
                  <h4>Credit</h4>
                  <CreditControl credit={credit || ''} onControlChange={handleControlChange} />
                </div>
              )}
              {fieldConfig?.showFontSizeControl && !fieldConfig?.showGroupedFontSizeControl && (
                <div className="edit-panel__section edit-panel__section--auto">
                  <h4>Schriftgröße</h4>
                  <FontSizeControl
                    fontSize={fontSize}
                    onControlChange={handleControlChange}
                    isQuoteType={type === 'zitat' || type === 'zitat-pure'}
                  />
                </div>
              )}
            </div>
          )}

          {fieldConfig?.showColorControls && (
            <div className="edit-panel__section">
              <h4>Farbschema</h4>
              <ColorSchemeControl
                colorScheme={
                  (Array.isArray(colorScheme) ? colorScheme : []) as Array<{ background: string }>
                }
                onControlChange={handleControlChange}
              />
            </div>
          )}

          {fieldConfig?.showAdvancedEditing && (
            <>
              <button
                className={`edit-panel__advanced-toggle ${isAdvancedEditingOpen ? 'edit-panel__advanced-toggle--open' : ''}`}
                onClick={toggleAdvancedEditing}
              >
                <HiSparkles />
                Erweiterte Einstellungen
                <FaChevronDown />
              </button>

              {isAdvancedEditingOpen && (
                <div className="advanced-controls-row">
                  <div className="advanced-control-item">
                    <h5>Balken</h5>
                    <BalkenOffsetControl
                      balkenOffset={balkenOffset || [50, -100, 50]}
                      onControlChange={handleControlChange}
                    />
                  </div>
                  <div className="advanced-control-item">
                    <h5>Gruppe</h5>
                    <BalkenGruppeControl
                      offset={balkenGruppenOffset || ([0, 0] as [number, number])}
                      onOffsetChange={(value) => handleControlChange('balkenGruppenOffset', value)}
                    />
                  </div>
                  <div className="advanced-control-item">
                    <h5>Sonnenblume</h5>
                    <SonnenblumenControl
                      offset={sunflowerOffset || ([0, 0] as [number, number])}
                      onOffsetChange={(value) => handleControlChange('sunflowerOffset', value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="edit-panel__actions">
          <button
            className="btn-primary"
            onClick={() => {
              onRegenerate();
              onClose();
            }}
            disabled={loading}
          >
            {loading ? <div className="button-spinner" /> : <FaRedo />}
            Aktualisieren
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditPanel;
