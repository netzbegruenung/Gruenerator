import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import { IMAGE_MODIFICATION } from '../../../components/utils/constants';
import './SharepicAdvancedControls.css';

/**
 * SharepicAdvancedControls - Advanced editing controls for sharepic customization
 * Only shown in RESULT step for types that support modification (Dreizeilen, Zitat)
 */
const SharepicAdvancedControls = ({ control, watchType, needsModification }) => {
  if (!needsModification) {
    return null;
  }

  return (
    <div className="sharepic-advanced-controls">
      <h3>Anpassungen</h3>
      <p className="controls-description">
        Passe die Darstellung deines Sharepics an
      </p>

      <div className="control-group">
        <Controller
          name="fontSize"
          control={control}
          render={({ field }) => (
            <div className="control-field">
              <label htmlFor="fontSize">
                Schriftgröße: {field.value}px
              </label>
              <input
                {...field}
                id="fontSize"
                type="range"
                min="24"
                max="72"
                step="1"
                className="control-slider"
              />
            </div>
          )}
        />
      </div>

      <div className="control-group">
        <Controller
          name="balkenOffset"
          control={control}
          render={({ field }) => (
            <div className="control-field-group">
              <label>Balken-Position</label>
              <div className="slider-pair">
                <div className="control-field">
                  <label htmlFor="balkenOffsetX">
                    Horizontal: {field.value?.[0] || 0}px
                  </label>
                  <input
                    id="balkenOffsetX"
                    type="range"
                    min="-100"
                    max="100"
                    step="5"
                    value={field.value?.[0] || 0}
                    onChange={(e) => {
                      const newValue = [parseInt(e.target.value), field.value?.[1] || 0];
                      field.onChange(newValue);
                    }}
                    className="control-slider"
                  />
                </div>
                <div className="control-field">
                  <label htmlFor="balkenOffsetY">
                    Vertikal: {field.value?.[1] || 0}px
                  </label>
                  <input
                    id="balkenOffsetY"
                    type="range"
                    min="-100"
                    max="100"
                    step="5"
                    value={field.value?.[1] || 0}
                    onChange={(e) => {
                      const newValue = [field.value?.[0] || 0, parseInt(e.target.value)];
                      field.onChange(newValue);
                    }}
                    className="control-slider"
                  />
                </div>
              </div>
            </div>
          )}
        />
      </div>

      <div className="control-group">
        <Controller
          name="colorScheme"
          control={control}
          render={({ field }) => {
            // Find the index of the current color scheme
            const currentIndex = IMAGE_MODIFICATION.COLOR_SCHEMES.findIndex(scheme =>
              JSON.stringify(scheme.colors) === JSON.stringify(field.value)
            );

            // Use 0 as default if no match found (first scheme)
            const selectValue = currentIndex >= 0 ? currentIndex : 0;

            return (
              <div className="control-field">
                <label htmlFor="colorScheme">Farbschema</label>
                <select
                  id="colorScheme"
                  className="control-select"
                  value={selectValue}
                  onChange={(e) => {
                    const selectedScheme = IMAGE_MODIFICATION.COLOR_SCHEMES[parseInt(e.target.value)];
                    if (selectedScheme && selectedScheme.colors) {
                      field.onChange(selectedScheme.colors);
                    }
                  }}
                >
                  {IMAGE_MODIFICATION.COLOR_SCHEMES.map((scheme, index) => (
                    <option key={scheme.name} value={index}>
                      {scheme.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }}
        />
      </div>

      {watchType === 'Dreizeilen' && (
        <>
          <div className="control-group">
            <Controller
              name="balkenGruppenOffset"
              control={control}
              render={({ field }) => (
                <div className="control-field-group">
                  <label>Balkengruppen-Abstand</label>
                  <div className="slider-pair">
                    <div className="control-field">
                      <label htmlFor="balkenGruppenOffsetX">
                        Horizontal: {field.value?.[0] || 0}px
                      </label>
                      <input
                        id="balkenGruppenOffsetX"
                        type="range"
                        min="-50"
                        max="50"
                        step="5"
                        value={field.value?.[0] || 0}
                        onChange={(e) => {
                          const newValue = [parseInt(e.target.value), field.value?.[1] || 0];
                          field.onChange(newValue);
                        }}
                        className="control-slider"
                      />
                    </div>
                    <div className="control-field">
                      <label htmlFor="balkenGruppenOffsetY">
                        Vertikal: {field.value?.[1] || 0}px
                      </label>
                      <input
                        id="balkenGruppenOffsetY"
                        type="range"
                        min="-50"
                        max="50"
                        step="5"
                        value={field.value?.[1] || 0}
                        onChange={(e) => {
                          const newValue = [field.value?.[0] || 0, parseInt(e.target.value)];
                          field.onChange(newValue);
                        }}
                        className="control-slider"
                      />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>

          <div className="control-group">
            <Controller
              name="sunflowerOffset"
              control={control}
              render={({ field }) => (
                <div className="control-field-group">
                  <label>Sonnenblumen-Position</label>
                  <div className="slider-pair">
                    <div className="control-field">
                      <label htmlFor="sunflowerOffsetX">
                        Horizontal: {field.value?.[0] || 0}px
                      </label>
                      <input
                        id="sunflowerOffsetX"
                        type="range"
                        min="-100"
                        max="100"
                        step="5"
                        value={field.value?.[0] || 0}
                        onChange={(e) => {
                          const newValue = [parseInt(e.target.value), field.value?.[1] || 0];
                          field.onChange(newValue);
                        }}
                        className="control-slider"
                      />
                    </div>
                    <div className="control-field">
                      <label htmlFor="sunflowerOffsetY">
                        Vertikal: {field.value?.[1] || 0}px
                      </label>
                      <input
                        id="sunflowerOffsetY"
                        type="range"
                        min="-100"
                        max="100"
                        step="5"
                        value={field.value?.[1] || 0}
                        onChange={(e) => {
                          const newValue = [field.value?.[0] || 0, parseInt(e.target.value)];
                          field.onChange(newValue);
                        }}
                        className="control-slider"
                      />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        </>
      )}

      <div className="control-group">
        <Controller
          name="credit"
          control={control}
          render={({ field }) => (
            <div className="control-field">
              <label htmlFor="credit">Bildnachweis (optional)</label>
              <input
                {...field}
                id="credit"
                type="text"
                placeholder="z.B. Foto: Max Mustermann"
                className="control-input"
              />
            </div>
          )}
        />
      </div>

      <div className="controls-info">
        <p>
          💡 Ändere die Werte und klicke auf "Änderungen übernehmen", um das Sharepic zu aktualisieren.
        </p>
      </div>
    </div>
  );
};

SharepicAdvancedControls.propTypes = {
  control: PropTypes.object.isRequired,
  watchType: PropTypes.string.isRequired,
  needsModification: PropTypes.bool.isRequired
};

export default SharepicAdvancedControls;
