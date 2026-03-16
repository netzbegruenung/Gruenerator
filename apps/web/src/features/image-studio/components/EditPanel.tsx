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
import { btn } from '../../../utils/buttonStyles';
import { cn } from '../../../utils/cn';

import ConfigDrivenFields from './ConfigDrivenFields';

import type {
  TemplateResultEditPanelProps,
  SloganAlternativeWithIndex,
} from '../types/templateResultTypes';

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
        className="fixed inset-0 bg-[var(--overlay-dark-sm)] z-[1100] dark:bg-[var(--overlay-dark-md)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      />
      <motion.div
        className={cn(
          'fixed bg-background p-0 overflow-hidden z-[1101] flex flex-col',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)]',
          // Desktop: side panel
          'lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:w-[480px] lg:max-h-screen lg:rounded-l-2xl lg:rounded-tr-none lg:shadow-[-4px_0_24px_rgba(0,0,0,0.12)]',
          'min-[1440px]:w-[520px]',
          'dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)] dark:lg:shadow-[-4px_0_24px_rgba(0,0,0,0.4)]'
        )}
        initial={isDesktop ? { x: '100%' } : { y: '100%' }}
        animate={isDesktop ? { x: 0 } : { y: 0 }}
        exit={isDesktop ? { x: '100%' } : { y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="flex justify-between items-center px-lg py-md border-b border-[var(--border-subtle)] bg-background shrink-0">
          <h3 className="m-0 text-lg font-semibold text-foreground-heading">Bild bearbeiten</h3>
          <button
            className="bg-transparent border-none cursor-pointer p-xs rounded-full flex items-center justify-center text-foreground transition-colors duration-200 hover:bg-background-alt [&_svg]:w-6 [&_svg]:h-6"
            onClick={onClose}
            aria-label="Panel schließen"
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-lg pb-sm flex flex-col gap-md">
          {fieldConfig?.showImageUpload && (
            <div className="flex flex-col gap-sm">
              <h4 className="m-0 text-base font-semibold text-foreground">Hintergrundbild</h4>
              <div className="flex items-center gap-md">
                <div className="w-16 h-16 rounded-md overflow-hidden shrink-0 bg-background-alt flex items-center justify-center">
                  {currentImagePreview ? (
                    <img
                      src={currentImagePreview}
                      alt="Aktuelles Bild"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-foreground opacity-50 [&_svg]:w-6 [&_svg]:h-6">
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
                  className={btn.secondary}
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

          <div className="flex flex-col gap-sm">
            <h4 className="m-0 text-base font-semibold text-foreground">Text</h4>
            {fieldConfig?.showGroupedFontSizeControl ? (
              <div className="flex flex-col gap-sm">
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
            <div className="flex flex-col gap-sm">
              {displayAlternatives.length === 0 ? (
                <button
                  className={btn.secondary}
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
                    className={cn(
                      'flex items-center gap-sm w-full bg-transparent border-none cursor-pointer py-sm px-0 text-foreground text-base font-semibold transition-colors duration-200 hover:text-[var(--interactive-accent-color)]',
                      '[&_svg:last-child]:ml-auto [&_svg:last-child]:transition-transform [&_svg:last-child]:duration-200',
                      isAlternativesOpen && '[&_svg:last-child]:rotate-180'
                    )}
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
                        className="overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex flex-wrap gap-xs py-sm">
                          {displayAlternatives.map((alt) => (
                            <button
                              key={alt._index}
                              className="bg-background-alt border border-grey-200 dark:border-grey-700 rounded-full px-sm py-xs text-sm cursor-pointer transition-all duration-200 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap hover:bg-[var(--tanne-10)] hover:border-[var(--tanne)] hover:text-[var(--tanne)]"
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
            <div className="flex flex-col gap-md min-[480px]:flex-row min-[480px]:items-stretch">
              {fieldConfig?.showCredit && (
                <div className="flex flex-col gap-sm min-[480px]:flex-1 min-[480px]:min-w-0 min-[480px]:pr-md min-[480px]:border-r min-[480px]:border-[var(--border-subtle)]">
                  <h4 className="m-0 text-base font-semibold text-foreground">Credit</h4>
                  <CreditControl credit={credit || ''} onControlChange={handleControlChange} />
                </div>
              )}
              {fieldConfig?.showFontSizeControl && !fieldConfig?.showGroupedFontSizeControl && (
                <div className="flex flex-col gap-sm min-[480px]:flex-none min-[480px]:pl-sm">
                  <h4 className="m-0 text-base font-semibold text-foreground">Schriftgröße</h4>
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
            <div className="flex flex-col gap-sm">
              <h4 className="m-0 text-base font-semibold text-foreground">Farbschema</h4>
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
                className={cn(
                  'flex items-center gap-sm bg-transparent border-none cursor-pointer py-sm px-0 text-foreground text-sm transition-colors duration-200 hover:text-[var(--interactive-accent-color)]',
                  isAdvancedEditingOpen && '[&_svg:last-child]:rotate-180'
                )}
                onClick={toggleAdvancedEditing}
              >
                <HiSparkles />
                Erweiterte Einstellungen
                <FaChevronDown />
              </button>

              {isAdvancedEditingOpen && (
                <div className="flex flex-wrap gap-md py-sm">
                  <div className="flex flex-col gap-xs min-w-[120px]">
                    <h5 className="m-0 text-sm font-semibold text-foreground">Balken</h5>
                    <BalkenOffsetControl
                      balkenOffset={balkenOffset || [50, -100, 50]}
                      onControlChange={handleControlChange}
                    />
                  </div>
                  <div className="flex flex-col gap-xs min-w-[120px]">
                    <h5 className="m-0 text-sm font-semibold text-foreground">Gruppe</h5>
                    <BalkenGruppeControl
                      offset={balkenGruppenOffset || ([0, 0] as [number, number])}
                      onOffsetChange={(value) => handleControlChange('balkenGruppenOffset', value)}
                    />
                  </div>
                  <div className="flex flex-col gap-xs min-w-[120px]">
                    <h5 className="m-0 text-sm font-semibold text-foreground">Sonnenblume</h5>
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

        <div className="flex gap-md px-lg py-md border-t border-[var(--border-subtle)] bg-background shrink-0">
          <button
            className={cn(btn.primary, 'flex-1')}
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
