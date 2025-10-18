import React from 'react';
import PropTypes from 'prop-types';
import FormStateProvider from '../../../components/common/Form/FormStateProvider';
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import ImageDisplay from '../../../components/common/ImageDisplay';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { resolveTextContent } from '../utils/textResolvers';

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

const ResultCard = React.memo(({
  result,
  index,
  activeResultId,
  isEditModeActive,
  introHelpContent,
  onEditRequest,
  onReset
}) => {
  const getGeneratedText = useGeneratedTextStore(state => state.getGeneratedText);

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
          {sharepicItems.length > 1 ? (
            // Multiple sharepics - use single ImageDisplay with array
            (() => {
              const resolvedSharepicTitle = Array.isArray(sharepicTitleSource)
                ? sharepicTitleSource[0]
                : sharepicTitleSource;
              const resolvedDownloadButtonText = Array.isArray(sharepicDownloadTextSource)
                ? sharepicDownloadTextSource[0]
                : sharepicDownloadTextSource;
              const resolvedDownloadFilename = Array.isArray(sharepicDownloadFilenameSource)
                ? sharepicDownloadFilenameSource[0]
                : sharepicDownloadFilenameSource;
              const resolvedEnableKiLabel = Array.isArray(enableKiLabelSource)
                ? enableKiLabelSource[0]
                : enableKiLabelSource;
              const resolvedOnSharepicUpdate = Array.isArray(onSharepicUpdateSource)
                ? onSharepicUpdateSource[0]
                : onSharepicUpdateSource;

              const imageDisplay = (
                <ImageDisplay
                  key={`${componentId}_multiple_sharepics`}
                  sharepicData={sharepicItems}
                  onEdit={onEditSharepic}
                  showEditButton={showEditButton !== false}
                  title={resolvedSharepicTitle || `${title} (${sharepicItems.length} Bilder)`}
                  downloadButtonText={resolvedDownloadButtonText || 'Herunterladen'}
                  downloadFilename={resolvedDownloadFilename || 'sharepic.png'}
                  enableKiLabel={resolvedEnableKiLabel}
                  onSharepicUpdate={resolvedOnSharepicUpdate}
                  minimal={true}
                />
              );

              if (!hasTextContent) {
                return imageDisplay;
              }

              return (
                <div key={`${componentId}_multiple_sharepic_text`} className="results-deck-sharepic-row">
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
            })()
          ) : (
            // Single sharepic - render as before
            sharepicItems.slice(0, 1).map((sharepicData, sharepicIndex) => {
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
            })
          )}
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
});

ResultCard.propTypes = {
  result: PropTypes.shape({
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
    title: PropTypes.string,
    error: PropTypes.string
  }).isRequired,
  index: PropTypes.number.isRequired,
  activeResultId: PropTypes.string,
  isEditModeActive: PropTypes.bool,
  introHelpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  onEditRequest: PropTypes.func,
  onReset: PropTypes.func
};

ResultCard.defaultProps = {
  activeResultId: null,
  isEditModeActive: false,
  introHelpContent: undefined,
  onEditRequest: undefined,
  onReset: undefined
};

ResultCard.displayName = 'ResultCard';

export default ResultCard;