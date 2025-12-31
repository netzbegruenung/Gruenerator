import React, { lazy, Suspense, ReactNode, ReactElement } from 'react';
import type { ContentRendererProps, GeneratedContent } from '@/types/baseform';

const ReactMarkdown = lazy(() => import('react-markdown'));
const FinetuneEditor = lazy(() => import('../EditMode/FinetuneEditor'));

import { isReactElement, isMarkdownContent, normalizeLineBreaks, removeGruenTitleTags, stripWrappingCodeFence } from '../utils/contentUtils';
import { CitationBadge } from '../../Citation';
import ImageDisplay from '../../ImageDisplay';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';

interface Citation {
  index: string | number;
  [key: string]: unknown;
}

interface MixedContent {
  sharepic?: unknown | unknown[];
  social?: { content?: string };
  content?: string;
  onEditSharepic?: () => void;
  inlineSharepicEditEnabled?: boolean;
  editMode?: string;
  showEditButton?: boolean;
  sharepicTitle?: string | string[];
  sharepicDownloadText?: string | string[];
  sharepicDownloadFilename?: string | string[];
  enableKiLabel?: boolean | boolean[];
  enableCanvaEdit?: boolean | boolean[];
  canvaTemplateUrl?: string | string[];
  onSharepicUpdate?: (() => void) | (() => void)[];
  selectedPlatforms?: string[];
}

const enhanceTextWithCitations = (text: string, citations: Citation[]): ReactNode => {
  if (!text || !citations || citations.length === 0) return text;

  const parts = text.split(/(\[\d+\])/g);
  const elements: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const match = part.match(/\[(\d+)\]/);

    if (match) {
      const citationIndex = match[1];
      const citation = citations.find(c =>
        String(c.index) === citationIndex ||
        c.index === parseInt(citationIndex, 10)
      );

      elements.push(
        <CitationBadge
          key={`citation-${i}-${citationIndex}`}
          citationIndex={citationIndex}
          citation={citation}
        />
      );
    } else if (part) {
      elements.push(part);
    }
  }

  return elements;
};

const ContentRenderer: React.FC<ContentRendererProps> = ({
  value,
  generatedContent,
  useMarkdown = null,
  componentName = 'default',
  helpContent,
  onEditModeToggle,
  isEditModeActive = false,
}) => {
  const getGeneratedTextMetadata = useGeneratedTextStore(state => state.getGeneratedTextMetadata);

  let processedGeneratedContent: GeneratedContent | undefined = generatedContent;
  if (generatedContent && typeof generatedContent === 'object' &&
      'content' in generatedContent &&
      'success' in generatedContent) {
    processedGeneratedContent = (generatedContent as { content: string }).content;
  }

  const isMixedContent = processedGeneratedContent && typeof processedGeneratedContent === 'object' &&
    ('sharepic' in processedGeneratedContent || 'social' in processedGeneratedContent);

  const mixedContent = processedGeneratedContent as MixedContent | undefined;

  const rawContent = isMixedContent && mixedContent
    ? (mixedContent.social?.content || mixedContent.content || '')
    : (value || processedGeneratedContent || '');

  const contentToRender = typeof rawContent === 'string'
    ? normalizeLineBreaks(stripWrappingCodeFence(removeGruenTitleTags(rawContent)))
    : rawContent;

  const metadata = getGeneratedTextMetadata(componentName);
  const citations: Citation[] = metadata?.citations || [];

  if (isMixedContent && mixedContent) {
    const sharepicItems = Array.isArray(mixedContent.sharepic)
      ? mixedContent.sharepic.filter(Boolean)
      : mixedContent.sharepic
        ? [mixedContent.sharepic]
        : [];

    return (
      <div className="generated-content-wrapper mixed-content">
        {contentToRender && typeof contentToRender === 'string' && (
          <div className="social-content-section">
            <Suspense fallback={<div className="finetune-loading">Editor wird geladen...</div>}>
              <FinetuneEditor
                componentName={componentName}
                readOnly={!isEditModeActive}
              />
            </Suspense>
          </div>
        )}

        {sharepicItems.length > 0 && !isEditModeActive && (
          <div className="sharepic-content-section">
            {sharepicItems.length > 1 ? (
              <ImageDisplay
                key="multiple-sharepics"
                sharepicData={sharepicItems}
                onEdit={mixedContent.onEditSharepic}
                onEditModeToggle={onEditModeToggle}
                editMode={mixedContent.inlineSharepicEditEnabled ? 'inline' : mixedContent.editMode}
                showEditButton={mixedContent.showEditButton !== false}
                title={mixedContent.sharepicTitle as string || "Generierte Sharepics"}
                downloadButtonText={mixedContent.sharepicDownloadText as string}
                downloadFilename={mixedContent.sharepicDownloadFilename as string || "sharepic.png"}
                enableKiLabel={mixedContent.enableKiLabel as boolean}
                enableCanvaEdit={mixedContent.enableCanvaEdit as boolean}
                canvaTemplateUrl={mixedContent.canvaTemplateUrl as string}
                onSharepicUpdate={mixedContent.onSharepicUpdate as () => void}
                socialContent={mixedContent.social?.content || mixedContent.content || ''}
                selectedPlatforms={mixedContent.selectedPlatforms}
              />
            ) : (
              sharepicItems.map((sharepicData, index) => {
                const sharepicTitle = Array.isArray(mixedContent.sharepicTitle)
                  ? mixedContent.sharepicTitle[index]
                  : mixedContent.sharepicTitle;
                const downloadButtonText = Array.isArray(mixedContent.sharepicDownloadText)
                  ? mixedContent.sharepicDownloadText[index]
                  : mixedContent.sharepicDownloadText;
                const downloadFilename = Array.isArray(mixedContent.sharepicDownloadFilename)
                  ? mixedContent.sharepicDownloadFilename[index]
                  : mixedContent.sharepicDownloadFilename;
                const enableKiLabel = Array.isArray(mixedContent.enableKiLabel)
                  ? mixedContent.enableKiLabel[index]
                  : mixedContent.enableKiLabel;
                const onSharepicUpdate = Array.isArray(mixedContent.onSharepicUpdate)
                  ? mixedContent.onSharepicUpdate[index]
                  : mixedContent.onSharepicUpdate;
                const enableCanvaEdit = Array.isArray(mixedContent.enableCanvaEdit)
                  ? mixedContent.enableCanvaEdit[index]
                  : mixedContent.enableCanvaEdit;
                const canvaTemplateUrl = Array.isArray(mixedContent.canvaTemplateUrl)
                  ? mixedContent.canvaTemplateUrl[index]
                  : mixedContent.canvaTemplateUrl;

                return (
                  <ImageDisplay
                    key={(sharepicData as { id?: string; type?: string }).id || `${(sharepicData as { type?: string }).type || 'sharepic'}-${index}`}
                    sharepicData={sharepicData}
                    onEdit={mixedContent.onEditSharepic}
                    onEditModeToggle={onEditModeToggle}
                    editMode={mixedContent.inlineSharepicEditEnabled ? 'inline' : mixedContent.editMode}
                    showEditButton={mixedContent.showEditButton !== false}
                    title={sharepicTitle}
                    downloadButtonText={downloadButtonText}
                    downloadFilename={downloadFilename}
                    enableKiLabel={enableKiLabel}
                    enableCanvaEdit={enableCanvaEdit}
                    canvaTemplateUrl={canvaTemplateUrl}
                    onSharepicUpdate={onSharepicUpdate}
                    socialContent={mixedContent.social?.content || mixedContent.content || ''}
                    selectedPlatforms={mixedContent.selectedPlatforms}
                  />
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  if (!contentToRender) {
    return null;
  }

  if (isReactElement(processedGeneratedContent)) {
    return processedGeneratedContent as ReactElement;
  }

  if (typeof contentToRender === 'string') {
    return (
      <div className={`generated-content-wrapper ${isEditModeActive ? 'editable' : ''}`}>
        <Suspense fallback={<div className="finetune-loading">Editor wird geladen...</div>}>
          <FinetuneEditor
            componentName={componentName}
            readOnly={!isEditModeActive}
          />
        </Suspense>
      </div>
    );
  }

  const shouldUseMarkdown = useMarkdown !== null ? useMarkdown : isMarkdownContent(contentToRender as string);

  const createCitationComponents = (citations: Citation[]) => {
    const processCitationText = (text: unknown): ReactNode => {
      if (typeof text !== 'string' || !text.includes('⚡CITE')) {
        return text as ReactNode;
      }

      const markerPattern = /(⚡CITE\d+⚡)/g;
      const parts = text.split(markerPattern);
      const elements: ReactNode[] = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const match = part.match(/⚡CITE(\d+)⚡/);

        if (match) {
          const citationIndex = match[1];
          const citation = citations.find(c =>
            String(c.index) === citationIndex ||
            c.index === parseInt(citationIndex, 10)
          );

          elements.push(
            <CitationBadge
              key={`citation-${i}-${citationIndex}`}
              citationIndex={citationIndex}
              citation={citation}
            />
          );
        } else if (part) {
          elements.push(part);
        }
      }

      return <>{elements}</>;
    };

    return {
      text: ({ children }: { children: ReactNode }) => processCitationText(children),
      p: ({ children }: { children: ReactNode }) => {
        const hasMarkers = React.Children.toArray(children).some(child =>
          typeof child === 'string' && child.includes('⚡CITE')
        );

        if (hasMarkers) {
          return <p>{React.Children.map(children, child =>
            typeof child === 'string' ? processCitationText(child) : child
          )}</p>;
        }

        return <p>{children}</p>;
      },
      li: ({ children }: { children: ReactNode }) => {
        const hasMarkers = React.Children.toArray(children).some(child =>
          typeof child === 'string' && child.includes('⚡CITE')
        );

        if (hasMarkers) {
          return <li>{React.Children.map(children, child =>
            typeof child === 'string' ? processCitationText(child) : child
          )}</li>;
        }

        return <li>{children}</li>;
      }
    };
  };

  if (shouldUseMarkdown) {
    const hasCitationMarkers = /⚡CITE\d+⚡/.test(contentToRender as string);

    if (hasCitationMarkers && citations.length > 0) {
      const customComponents = createCitationComponents(citations);

      return (
        <div className="generated-content-wrapper">
          <div className="content-display markdown-content">
            <Suspense fallback={<div>Loading...</div>}>
              <ReactMarkdown components={customComponents}>
                {contentToRender as string}
              </ReactMarkdown>
            </Suspense>
          </div>
        </div>
      );
    } else {
      return (
        <div className="generated-content-wrapper">
          <div className="content-display markdown-content">
            <Suspense fallback={<div>Loading...</div>}>
              <ReactMarkdown>
                {contentToRender as string}
              </ReactMarkdown>
            </Suspense>
          </div>
        </div>
      );
    }
  } else {
    let enhancedContent: ReactNode = contentToRender;
    if (citations.length > 0 && typeof contentToRender === 'string') {
      enhancedContent = enhanceTextWithCitations(contentToRender, citations);
    }

    return (
      <div className="generated-content-wrapper">
        <div className="content-display">
          {typeof enhancedContent === 'string' ? (
            <div dangerouslySetInnerHTML={{ __html: enhancedContent }} />
          ) : (
            enhancedContent
          )}
        </div>
      </div>
    );
  }
};

ContentRenderer.displayName = 'ContentRenderer';

export default ContentRenderer;
