import React from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import './AiHistoryTimeline.css';

/**
 * Visual timeline showing AI generation history
 * Displays thumbnails and prompts for each generation with navigation
 */
export const AiHistoryTimeline: React.FC = () => {
  const { aiEditorHistory, aiEditorHistoryIndex, loadHistoryEntry } = useImageStudioStore();

  if (aiEditorHistory.length === 0) {
    return null;
  }

  return (
    <div className="ai-history-timeline">
      <div className="ai-history-timeline-label">History:</div>
      <div className="ai-history-timeline-items">
        {aiEditorHistory.map((entry, index) => (
          <div
            key={entry.id}
            className={`ai-history-item ${index === aiEditorHistoryIndex ? 'active' : ''} ${index > aiEditorHistoryIndex ? 'future' : ''}`}
            onClick={() => loadHistoryEntry(index)}
            title={`${entry.prompt.substring(0, 50)}${entry.prompt.length > 50 ? '...' : ''}`}
          >
            <div className="ai-history-item-thumbnail">
              <img src={entry.generatedImage} alt={`Generation ${index + 1}`} loading="lazy" />
            </div>
            <div className="ai-history-item-number">#{index + 1}</div>
            {index === aiEditorHistoryIndex && (
              <div className="ai-history-item-current-indicator">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AiHistoryTimeline;
