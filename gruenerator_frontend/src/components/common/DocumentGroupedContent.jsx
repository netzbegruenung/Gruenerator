import React from 'react';

const groupLabels = {
  manual: 'Dokumente',
  wolke: 'Wolke Dokumente',
};

const groupIcons = {
  manual: '📁',
  wolke: '☁️',
};

const DocumentGroupedContent = ({ groupedItems = {}, expandedGroups, onToggleGroup, cardRenderer, renderDefaultCard }) => {
  return (
    <div className="document-overview-grouped">
      {Object.entries(groupedItems).map(([groupKey, items]) => {
        if (!items || items.length === 0) return null;
        const isExpanded = expandedGroups.has(groupKey);
        const groupLabel = groupLabels[groupKey] || groupKey;
        const groupIcon = groupIcons[groupKey] || '📄';

        return (
          <div key={groupKey} className={`document-group document-group-${groupKey} ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="document-group-header" onClick={() => onToggleGroup(groupKey)}>
              <span className="document-group-icon" aria-hidden>
                {groupIcon}
              </span>
              <h3>{groupLabel}</h3>
              <span className="document-group-count">{items.length}</span>
              <button className="document-group-chevron" aria-expanded={isExpanded} aria-controls={`group-${groupKey}`}>
                {isExpanded ? '▼' : '▶'}
              </button>
            </div>

            {isExpanded && (
              <div id={`group-${groupKey}`} className="document-group-content">
                <div className="document-overview-grid">
                  {items.map((item) => (cardRenderer ? cardRenderer(item) : renderDefaultCard(item)))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DocumentGroupedContent;

