import React from 'react';
import PropTypes from 'prop-types';
import ResultCard from './ResultCard';
import '../../../assets/styles/components/chat/results-deck.css';

const ResultsDeck = ({
  results,
  onClear,
  introHelpContent,
  onEditRequest,
  onReset,
  activeResultId,
  isEditModeActive
}) => {
  return (
    <div className="results-deck">
      <div className="results-deck-cards">
        {results.map((result, index) => (
          <ResultCard
            key={result.id || result.componentId || `multiResult_${index}`}
            result={result}
            index={index}
            activeResultId={activeResultId}
            isEditModeActive={isEditModeActive}
            introHelpContent={introHelpContent}
            onEditRequest={onEditRequest}
            onReset={onReset}
          />
        ))}
      </div>
    </div>
  );
};

ResultsDeck.propTypes = {
  results: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    componentId: PropTypes.string,
    confidence: PropTypes.number,
    content: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        text: PropTypes.string,
        content: PropTypes.string,
        social: PropTypes.shape({
          content: PropTypes.string
        }),
        sharepic: PropTypes.oneOfType([
          PropTypes.object,
          PropTypes.array
        ])
      })
    ]),
    metadata: PropTypes.object,
    title: PropTypes.string
  })),
  onClear: PropTypes.func,
  introHelpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  onEditRequest: PropTypes.func,
  onReset: PropTypes.func,
  activeResultId: PropTypes.string,
  isEditModeActive: PropTypes.bool
};

ResultsDeck.defaultProps = {
  results: [],
  onClear: undefined,
  introHelpContent: undefined,
  onEditRequest: undefined,
  onReset: undefined,
  activeResultId: null,
  isEditModeActive: false
};

export default React.memo(ResultsDeck);
