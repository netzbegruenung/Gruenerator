import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import '../../assets/styles/components/popups/help.css';

const HelpDisplay = ({
  content,
  tips,
  forceHidden,
  hasGeneratedContent,
  isNewFeature,
  featureId,
  fallbackContent,
  fallbackTips
}) => {
  const { generatedText } = useGeneratedTextStore();

  const hasSeenFeature = React.useMemo(() => {
    if (!featureId || !isNewFeature) return false;
    return localStorage.getItem(`feature-seen-${featureId}`) === 'true';
  }, [featureId, isNewFeature]);

  // Mark as seen AFTER first render (so border shows on first visit)
  useEffect(() => {
    if (isNewFeature && featureId && !hasSeenFeature) {
      localStorage.setItem(`feature-seen-${featureId}`, 'true');
    }
  }, [isNewFeature, featureId, hasSeenFeature]);

  const displayContent = (hasSeenFeature && fallbackContent) ? fallbackContent : content;
  const displayTips = (hasSeenFeature && fallbackTips) ? fallbackTips : tips;
  const showNewFeatureStyle = isNewFeature && !hasSeenFeature;

  const isHidden = forceHidden ||
                   hasGeneratedContent ||
                   (generatedText && generatedText.length > 0);

  if (!displayContent || isHidden) {
    return null;
  }

  return (
    <div className={`help-display ${showNewFeatureStyle ? 'help-display--new-feature' : ''}`}>
      <div className="help-content">
        {showNewFeatureStyle && <span className="help-display__badge">Neu</span>}
        <div className="help-content-text">
          {(() => {
            const colonOrPeriodMatch = displayContent.match(/^([^:.]+[:.]\s*)(.+)$/);

            if (colonOrPeriodMatch && colonOrPeriodMatch[2].includes(',')) {
              const [, prefix, itemsText] = colonOrPeriodMatch;
              const items = itemsText.split(',').map(item => item.trim()).filter(item => item);

              if (items.length > 1) {
                return (
                  <>
                    <p>{prefix}</p>
                    <ul>
                      {items.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </>
                );
              }
            }

            return displayContent.split('\n').filter(line => line.trim()).map((line, idx) => (
              <p key={idx}>{line}</p>
            ));
          })()}
        </div>
        {displayTips && displayTips.length > 0 && (
          <>
            <p><strong>Tipps:</strong></p>
            <ul>
              {displayTips.map((tip, index) => (
                <li key={index}>
                  {(() => {
                    if (typeof tip === 'string') {
                      const beiMatch = tip.match(/^(Bei [^:]+:\s*)(.+)$/);
                      if (beiMatch && beiMatch[2].includes(' - ')) {
                        const [, prefix, rest] = beiMatch;
                        const parts = rest.split(' - ');
                        const description = parts[0];
                        const formats = parts[1];

                        if (formats && formats.includes(', ')) {
                          const formatItems = formats.split(', ').map(item => item.trim());
                          return (
                            <>
                              <strong>{prefix}</strong>
                              {description}
                              <ul style={{marginTop: '4px'}}>
                                {formatItems.map((format, idx) => (
                                  <li key={idx}>{format}</li>
                                ))}
                              </ul>
                            </>
                          );
                        }
                      }
                    }

                    return tip;
                  })()}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

HelpDisplay.propTypes = {
  content: PropTypes.string.isRequired,
  tips: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.node])),
  forceHidden: PropTypes.bool,
  hasGeneratedContent: PropTypes.bool,
  isNewFeature: PropTypes.bool,
  featureId: PropTypes.string,
  fallbackContent: PropTypes.string,
  fallbackTips: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.node]))
};

HelpDisplay.defaultProps = {
  tips: [],
  forceHidden: false,
  hasGeneratedContent: false,
  isNewFeature: false,
  featureId: null,
  fallbackContent: null,
  fallbackTips: null
};

export default HelpDisplay;
