import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import FormStateProvider from '../../../components/common/Form/FormStateProvider';
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import ImageDisplay from '../../../components/common/ImageDisplay';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import '../../../assets/styles/components/chat/results-deck.css';

const createExportGetter = (getGeneratedText, componentId, content) => () => {
  const storedContent = componentId ? getGeneratedText(componentId) : null;

  const resolveContent = (source) => {
    if (!source) return '';
    if (typeof source === 'string') return source;
    if (typeof source === 'object') {
      if (typeof source.content === 'string') return source.content;
      if (source.social?.content) return source.social.content;
      if (typeof source.text === 'string') return source.text;
    }
    return '';
  };

  const fromStore = resolveContent(storedContent);
  if (fromStore) return fromStore;

  return resolveContent(content);
};

const resolveTextContent = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content.text === 'string') return content.text;
  if (typeof content.content === 'string') return content.content;
  if (content.social?.content && typeof content.social.content === 'string') {
    return content.social.content;
  }
  if (Array.isArray(content.lines)) {
    return content.lines.filter(Boolean).join('\n');
  }
  return '';
};

const ResultsDeck = ({
  results,
  onClear,
  introHelpContent,
  onEditRequest,
  onReset,
  activeResultId,
  isEditModeActive
}) => {
  const getGeneratedText = useGeneratedTextStore(state => state.getGeneratedText);

  return (
    <div className="results-deck">
      <div className="results-deck-cards">
        {results.map((result, index) => {
          const componentId = result.componentId || `multiResult_${index}`;
          const title = result.title || `Ergebnis ${index + 1}`;
          const isActive = activeResultId && activeResultId === componentId;
          const content = result.content || {};
          const {
            sharepic: sharepicField,
            sharepicTitle: sharepicTitleSource,
            sharepicDownloadText: sharepicDownloadTextSource,
            sharepicDownloadFilename: sharepicDownloadFilenameSource,
            enableKiLabel: enableKiLabelSource,
            onSharepicUpdate: onSharepicUpdateSource,
            onEditSharepic,
            showEditButton,
            ...textOnlyContent
          } = content;

          const sharepicItems = Array.isArray(sharepicField)
            ? sharepicField.filter(Boolean)
            : sharepicField
              ? [sharepicField]
              : [];

          const hasSharepicContent = sharepicItems.length > 0;
          const hasTextContent = typeof result.content?.text === 'string' && result.content.text.trim().length > 0;
          const isCombinedContent = hasSharepicContent && hasTextContent;

          const effectiveComponentId = isCombinedContent ? `${componentId}_text` : componentId;
          const resolvedText = resolveTextContent(isCombinedContent ? textOnlyContent || result.content : result.content);
          const exportSource = isCombinedContent ? {
            ...textOnlyContent,
            text: resolvedText,
            sharepic: undefined,
            sharepicTitle: undefined,
            sharepicDownloadText: undefined,
            sharepicDownloadFilename: undefined,
            enableKiLabel: undefined,
            onSharepicUpdate: undefined,
            onEditSharepic: undefined,
            showEditButton: undefined
          } : content;
          const textGeneratedContent = isCombinedContent ? resolvedText : result.content;
          const exportGetter = createExportGetter(getGeneratedText, effectiveComponentId, exportSource);

          const canEdit = resolvedText.trim().length > 0;

          return (
            <div
              key={result.id || componentId}
              className={`results-deck-card${isActive ? ' results-deck-card-active' : ''}`}
            >
              <div className="results-deck-card-header">
                <div className="results-deck-card-title">
                  <span className="results-deck-card-index">#{index + 1}</span>
                  <h4>{title}</h4>
                </div>
              </div>

              {hasSharepicContent ? (
                <div className={`results-deck-sharepic-wrapper ${hasTextContent ? 'with-text' : ''}`}>
                  {sharepicItems.slice(0, 1).map((sharepicData, sharepicIndex) => {
                    const resolvedSharepicTitle = Array.isArray(sharepicTitleSource)
                      ? sharepicTitleSource[sharepicIndex]
                      : sharepicTitleSource;
                    const resolvedDownloadButtonText = Array.isArray(sharepicDownloadTextSource)
                      ? sharepicDownloadTextSource[sharepicIndex]
                      : sharepicDownloadTextSource;
                    const resolvedDownloadFilename = Array.isArray(sharepicDownloadFilenameSource)
                      ? sharepicDownloadFilenameSource[sharepicIndex]
                      : sharepicDownloadFilenameSource;
                    const resolvedEnableKiLabel = Array.isArray(enableKiLabelSource)
                      ? enableKiLabelSource[sharepicIndex]
                      : enableKiLabelSource;
                    const resolvedOnSharepicUpdate = Array.isArray(onSharepicUpdateSource)
                      ? onSharepicUpdateSource[sharepicIndex]
                      : onSharepicUpdateSource;

                    const imageDisplay = (
                      <ImageDisplay
                        key={`${componentId}_sharepic_${sharepicIndex}`}
                        sharepicData={sharepicData}
                        onEdit={onEditSharepic}
                        showEditButton={showEditButton !== false}
                        title={resolvedSharepicTitle || title}
                        downloadButtonText={resolvedDownloadButtonText || 'Herunterladen'}
                        downloadFilename={resolvedDownloadFilename}
                        enableKiLabel={resolvedEnableKiLabel}
                        onSharepicUpdate={resolvedOnSharepicUpdate}
                        minimal={true}
                      />
                    );

                    if (!hasTextContent) {
                      return imageDisplay;
                    }

                    return (
                      <div key={`${componentId}_sharepic_text_${sharepicIndex}`} className="results-deck-sharepic-row">
                        <div className="results-deck-sharepic-column">
                          {imageDisplay}
                        </div>
                        <div className="results-deck-text-column">
                          <FormStateProvider formId={`multiResult-${componentId}-text`}>
                            <DisplaySection
                              title={title}
                              error={result.error}
                              value={resolvedText}
                              generatedContent={textGeneratedContent}
                              useMarkdown={true}
                              helpContent={index === 0 ? introHelpContent : undefined}
                              getExportableContent={exportGetter}
                              componentName={`${componentId}_text`}
                              showEditModeToggle={!!(canEdit && onEditRequest)}
                              isEditModeActive={isActive && isEditModeActive}
                              onRequestEdit={canEdit && onEditRequest ? () => onEditRequest(componentId) : undefined}
                              showUndoControls={false}
                              showRedoControls={false}
                              showResetButton={!!onReset}
                              onReset={onReset}
                              renderActions={(actions) => (
                                actions ? (
                                  <div className="results-deck-card-actions">
                                    {actions}
                                  </div>
                                ) : null
                              )}
                            />
                          </FormStateProvider>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <FormStateProvider formId={`multiResult-${componentId}`}>
                  <DisplaySection
                    title={title}
                    error={result.error}
                    value={resolveTextContent(result.content)}
                    generatedContent={resolveTextContent(result.content)}
                    useMarkdown={true}
                    helpContent={index === 0 ? introHelpContent : undefined}
                    getExportableContent={exportGetter}
                    componentName={componentId}
                    showEditModeToggle={!!(canEdit && onEditRequest)}
                    isEditModeActive={isActive && isEditModeActive}
                    onRequestEdit={canEdit && onEditRequest ? () => onEditRequest(componentId) : undefined}
                    showUndoControls={false}
                    showRedoControls={false}
                    showResetButton={!!onReset}
                    onReset={onReset}
                    renderActions={(actions) => (
                      actions ? (
                        <div className="results-deck-card-actions">
                          {actions}
                        </div>
                      ) : null
                    )}
                  />
                </FormStateProvider>
              )}
            </div>
          );
        })}
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

export default ResultsDeck;
