import React from 'react';
import PropTypes from 'prop-types';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import '../../assets/styles/components/popups/help.css';

const HelpDisplay = ({ content, tips, forceHidden, hasGeneratedContent }) => {
  const { generatedText } = useGeneratedTextStore();
  
  // Hide if there's generated content (from store OR prop), or force hidden
  const isHidden = forceHidden || 
                   hasGeneratedContent ||
                   (generatedText && generatedText.length > 0);

  if (!content || isHidden) {
    return null;
  }

  return (
    <div className="help-display">
      <div className="help-content">
        <div className="help-content-text">
          {(() => {
            // Check for content that should be formatted as a list
            // Pattern: "Text: item1, item2, item3" or "Text. item1, item2, item3"
            const colonOrPeriodMatch = content.match(/^([^:.]+[:.]\s*)(.+)$/);

            if (colonOrPeriodMatch && colonOrPeriodMatch[2].includes(',')) {
              const [, prefix, itemsText] = colonOrPeriodMatch;
              const items = itemsText.split(',').map(item => item.trim()).filter(item => item);

              // Only create a list if we have multiple items
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

            // Otherwise preserve line breaks and render as paragraphs
            return content.split('\n').filter(line => line.trim()).map((line, idx) => (
              <p key={idx}>{line}</p>
            ));
          })()}
        </div>
        {tips && tips.length > 0 && (
          <>
            <h4>Tipps:</h4>
            <ul>
              {tips.map((tip, index) => (
                <li key={index}>
                  {(() => {
                    // Only attempt pattern matching if tip is a string
                    if (typeof tip === 'string') {
                      // Check if tip contains "Bei X:" pattern with formats
                      const beiMatch = tip.match(/^(Bei [^:]+:\s*)(.+)$/);
                      if (beiMatch && beiMatch[2].includes(' - ')) {
                        const [, prefix, rest] = beiMatch;
                        const parts = rest.split(' - ');
                        const description = parts[0];
                        const formats = parts[1];

                        // Check if formats contain comma-separated items
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

                    // Otherwise return tip as-is (string or JSX element)
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
  hasGeneratedContent: PropTypes.bool
};

HelpDisplay.defaultProps = {
  tips: [],
  forceHidden: false,
  hasGeneratedContent: false
};

export default HelpDisplay; 