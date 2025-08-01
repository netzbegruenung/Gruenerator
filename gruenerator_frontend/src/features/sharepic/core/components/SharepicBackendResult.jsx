import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiChevronDown, HiChevronUp } from "react-icons/hi";
import Button from '../../../../components/common/SubmitButton';
import { useSharepicGeneratorContext } from '../utils/SharepicGeneratorContext';
import AdvancedEditingSection from '../../dreizeilen/components/AdvancedEditingSection';

import { 
  ColorSchemeControl, 
  FontSizeControl, 
  CreditControl,
} from '../../../../components/utils/ImageModificationForm';
import { 
  ARIA_LABELS, 
} from '../../../../components/utils/constants';

const SharepicBackendResult = ({
  children,
  onSubmit,
  loading,
  success,
  fontSize,
  balkenOffset,
  colorScheme,
  onControlChange,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
  formData
}) => {
  const { 
    state: { 
      isAdvancedEditingOpen,
    },
    toggleAdvancedEditing,
  } = useSharepicGeneratorContext();

  const handleSocialMediaClick = useCallback(() => {
    const url = new URL(window.location.origin + '/presse-social');
    url.searchParams.append('thema', formData.thema || '');
    url.searchParams.append('details', formData.details || '');
    window.open(url.toString(), '_blank');
  }, [formData]);

  return (
    <>
      <div className="image-modification-controls">
        <div className="left-column">
          {formData.type === 'Zitat' ? (
            <>
              <div className="textzeilen-group">
                <h3>Zitat</h3>
                <p>Hier änderst du das Zitat und den Namen</p>
                <div className="input-fields-wrapper">
                  {children}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="textzeilen-group">
                <h3>Textzeilen</h3>
                <p>Hier änderst du den Text auf dem Bild</p>
                <div className="input-fields-wrapper">
                  {children}
                </div>
              </div>
              {formData.type !== 'Info' && formData.type !== 'Zitat_Pure' && formData.type !== 'Headline' && (
                <div className="absender-group">
                  <h3>Absender</h3>
                  <p>Du kannst hier optional einen Absender einfügen oder das Feld frei lassen.</p>
                  <CreditControl
                    credit={credit}
                    onControlChange={onControlChange}
                  />
                </div>
              )}
            </>
          )}
          <Button
            onClick={onSubmit}
            loading={loading}
            success={success}
            text="Aktualisieren"
            icon={<HiCog />}
            className="form-button"
            ariaLabel={ARIA_LABELS.SUBMIT}
          />
        </div>
        <div className="right-column">
          {formData.type !== 'Zitat' && (
            <>
              {/* TODO: Implement color scheme support for Info posts */}
              {/* TODO: Implement color scheme support for Zitat_Pure posts */}
              {/* TODO: Implement color scheme support for Headline posts */}
              {formData.type !== 'Info' && formData.type !== 'Zitat_Pure' && formData.type !== 'Headline' && (
                <div className="color-controls">
                  <h3>Farbschema</h3>
                  <p>Wähle eine von vier Farbkombinationen für dein Sharepic.</p>
                  <ColorSchemeControl
                    colorScheme={colorScheme}
                    onControlChange={onControlChange}
                  />
                </div>
              )}
              {formData.type !== 'Info' && formData.type !== 'Zitat_Pure' && formData.type !== 'Headline' && (
                <div className="font-size-group">
                  <h3>Schriftgröße</h3>
                  <p>Passe die Größe des Textes auf deinem Sharepic an.</p>
                  <FontSizeControl
                    fontSize={fontSize}
                    onControlChange={onControlChange}
                  />
                </div>
              )}
            </>
          )}
          <div className="social-media-group">
            <h3>Social Media</h3>
            <p>Erstelle passende Beitragstexte für deine Social-Media-Kanäle.</p>
            <Button
              onClick={handleSocialMediaClick}
              text="Beitragstext erstellen"
              className="social-media-button"
              ariaLabel={ARIA_LABELS.SOCIAL_MEDIA}
            />
          </div>
        </div>
      </div>
      {formData.type !== 'Zitat' && formData.type !== 'Info' && formData.type !== 'Zitat_Pure' && formData.type !== 'Headline' && (
        <div className="advanced-editing-button-container">
          <Button
            type="button"
            text={isAdvancedEditingOpen ? "Erweiterte Bildbearbeitung schließen" : "Erweiterte Bildbearbeitung"}
            className={`advanced-editing-button ${isAdvancedEditingOpen ? 'open' : ''}`}
            onClick={toggleAdvancedEditing}
            icon={isAdvancedEditingOpen ? <HiChevronUp /> : <HiChevronDown />}
          />
        </div>
      )}
      {isAdvancedEditingOpen && formData.type !== 'Info' && formData.type !== 'Zitat_Pure' && formData.type !== 'Headline' && (
        <AdvancedEditingSection
          balkenOffset={balkenOffset}
          balkenGruppenOffset={balkenGruppenOffset}
          sunflowerOffset={sunflowerOffset}
          onBalkenOffsetChange={(newOffset) => onControlChange('balkenOffset', newOffset)}
          onBalkenGruppenOffsetChange={(newOffset) => onControlChange('balkenGruppenOffset', newOffset)}
          onSonnenblumenOffsetChange={(newOffset) => onControlChange('sunflowerOffset', newOffset)}
        />
      )}
    </>
  );
};

SharepicBackendResult.propTypes = {
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  fontSize: PropTypes.number.isRequired,
  balkenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  colorScheme: PropTypes.arrayOf(PropTypes.shape({
    background: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })).isRequired,
  onControlChange: PropTypes.func.isRequired,
  balkenGruppenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  sunflowerOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  credit: PropTypes.string,
  formData: PropTypes.object.isRequired,
};

export default SharepicBackendResult;