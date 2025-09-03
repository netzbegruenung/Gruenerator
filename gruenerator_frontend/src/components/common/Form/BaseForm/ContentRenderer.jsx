import React, { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
const ReactMarkdown = lazy(() => import('react-markdown'));
import { isReactElement, isMarkdownContent, normalizeLineBreaks, removeGruenTitleTags } from '../utils/contentUtils';
import { CitationBadge } from '../../Citation';
import ImageDisplay from '../../ImageDisplay';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';


/**
 * Enhances text content with clickable citation badges
 * @param {string} text - Text content to enhance
 * @param {Array} citations - Array of citation objects
 * @returns {Array} Array of text and React elements
 */
const enhanceTextWithCitations = (text, citations) => {
  if (!text || !citations || citations.length === 0) return text;
  
  // Split text by citation patterns and rebuild with React components
  const parts = text.split(/(\[\d+\])/g);
  const elements = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const match = part.match(/\[(\d+)\]/);
    
    if (match) {
      const citationIndex = match[1];
      // Robust citation matching - handle both string and number indices
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

/**
 * Komponente zur Darstellung verschiedener Inhaltstypen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.value - Aktueller Wert
 * @param {any} props.generatedContent - Generierter Inhalt
 * @param {boolean} props.useMarkdown - Force markdown rendering (optional)
 * @param {string} props.componentName - Component name for citation lookup
 * @param {Object} props.helpContent - Hilfe-Inhalt (nicht mehr verwendet)
 * @returns {JSX.Element} Gerenderte Inhalte
 */
const ContentRenderer = ({
  value,
  generatedContent,
  useMarkdown = null, // null = auto-detect, true = force markdown, false = force HTML
  componentName = 'default',
  helpContent
}) => {
  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL - BEFORE ANY EARLY RETURNS
  const { getGeneratedTextMetadata } = useGeneratedTextStore();
  
  // Check if we have mixed content (social + sharepic)
  const isMixedContent = generatedContent && typeof generatedContent === 'object' && 
    (generatedContent.sharepic || generatedContent.social);
  
  const rawContent = isMixedContent 
    ? (generatedContent.social?.content || generatedContent.content || '')
    : (value || generatedContent || '');
    
  // Clean and normalize content
  const contentToRender = typeof rawContent === 'string' 
    ? normalizeLineBreaks(removeGruenTitleTags(rawContent))
    : rawContent;
  
  // Get citations from metadata if componentName is provided
  const metadata = getGeneratedTextMetadata(componentName);
  const citations = metadata?.citations || [];


  // NOW we can do conditional logic and early returns
  
  // Handle mixed content (social + sharepic)
  if (isMixedContent) {
    return (
      <div className="generated-content-wrapper mixed-content">
        {/* Render social content if available */}
        {contentToRender && (
          <div className="social-content-section">
            <div className="content-display">
              {typeof contentToRender === 'string' ? (
                isMarkdownContent(contentToRender) ? (
                  <Suspense fallback={<div>Loading...</div>}><ReactMarkdown>{contentToRender}</ReactMarkdown></Suspense>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: contentToRender }} />
                )
              ) : (
                contentToRender
              )}
            </div>
          </div>
        )}
        
        {/* Render sharepic if available */}
        {generatedContent.sharepic && (
          <div className="sharepic-content-section">
            <ImageDisplay 
              sharepicData={generatedContent.sharepic} 
              onEdit={generatedContent.onEditSharepic}
              showEditButton={generatedContent.showEditButton !== false}
              title={generatedContent.sharepicTitle}
              downloadButtonText={generatedContent.sharepicDownloadText}
              downloadFilename={generatedContent.sharepicDownloadFilename}
            />
          </div>
        )}
      </div>
    );
  }
  
  // Wenn kein Content vorhanden ist, zeige nichts an (HelpDisplay wird in DisplaySection gehandhabt)
  if (!contentToRender) {
    return null;
  }

  // Wenn generatedContent ein React-Element ist, direkt anzeigen
  if (isReactElement(generatedContent)) {
    return generatedContent;
  }

  // Determine if we should render as markdown
  const shouldUseMarkdown = useMarkdown !== null ? useMarkdown : isMarkdownContent(contentToRender);

  // Create comprehensive ReactMarkdown components that handle citation markers
  const createCitationComponents = (citations) => {
    const processCitationText = (text) => {
      if (typeof text !== 'string' || !text.includes('⚡CITE')) {
        return text;
      }
      
      // Split by citation markers and rebuild with inline components
      const markerPattern = /(⚡CITE\d+⚡)/g;
      const parts = text.split(markerPattern);
      const elements = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const match = part.match(/⚡CITE(\d+)⚡/);
        
        if (match) {
          const citationIndex = match[1];
          // Find citation by index
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
      // Handle all possible text containers
      text: ({ children }) => processCitationText(children),
      p: ({ children }) => {
        // Check if any child contains citation markers
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
      // Handle other common containers
      li: ({ children }) => {
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
    // Check if content has citation markers
    const hasCitationMarkers = /⚡CITE\d+⚡/.test(contentToRender);
    
    if (hasCitationMarkers && citations.length > 0) {
      // Use comprehensive custom components to handle citations inline
      const customComponents = createCitationComponents(citations);
      
      return (
        <div className="generated-content-wrapper">
          <div className="content-display markdown-content antrag-text-content">
            <Suspense fallback={<div>Loading...</div>}><ReactMarkdown components={customComponents}>
              {contentToRender}
            </ReactMarkdown></Suspense>
          </div>
        </div>
      );
    } else {
      // No citations, render normal markdown
      return (
        <div className="generated-content-wrapper">
          <div className="content-display markdown-content antrag-text-content">
            <Suspense fallback={<div>Loading...</div>}><ReactMarkdown>
              {contentToRender}
            </ReactMarkdown></Suspense>
          </div>
        </div>
      );
    }
  } else {
    // For non-markdown content, enhance with citations if available
    let enhancedContent = contentToRender;
    if (citations.length > 0 && typeof contentToRender === 'string') {
      enhancedContent = enhanceTextWithCitations(contentToRender, citations);
    }

    // Render as enhanced content or HTML (backward compatibility)
    return (
      <div className="generated-content-wrapper">
        <div 
          className="content-display"
        >
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

ContentRenderer.propTypes = {
  value: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.element
  ]),
  useMarkdown: PropTypes.bool, // null = auto-detect, true = force markdown, false = force HTML
  componentName: PropTypes.string,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  })
};

export default ContentRenderer; 