import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import FloatingToolbar from './FloatingToolbar';
import EditorChat from '../../components/common/editor/EditorChatnew';
import QuillYjsEditor from '../../components/common/editor/collab/QuillYjsEditor';
import useCollabEditorStore from '../../stores/collabEditorStore';
import apiClient from '../../components/utils/apiClient';
import { applyHighlightWithAnimation, removeAllHighlights as removeAllQuillHighlights, applyNewTextHighlight } from '../../components/common/editor/utils/highlightUtils';
// Quill will be dynamically imported when needed
import CollabEditorSkeleton from './CollabEditorSkeleton'; // NEU: Import Skeleton
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { Link } from 'react-router-dom';

const CollabEditorPage = () => {
  const { documentId } = useParams();
  const location = useLocation();
  const isPreviewMode = location.pathname.includes('/preview');
  const { user, loading: authLoading, isAuthResolved } = useOptimizedAuth();
  const { betaFeatures, isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const { cleanup } = useCollabEditorStore();
  const [initialContent, setInitialContent] = useState(undefined); // Start with undefined
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [errorLoadingContent, setErrorLoadingContent] = useState(null);

  const quillRef = useRef(null); // Ref for the Quill instance, managed by CollabEditorPageContent
  
  // States for selection and highlighting, managed by parent for context provisioning
  const [selectedText, setSelectedText] = useState('');
  const [highlightedRange, setHighlightedRange] = useState(null);
  const [isEditing, setIsEditing] = useState(true); // Always editing in collab mode

  // Check if user has access to collab feature
  const hasCollabAccess = betaFeatures?.collab === true;

  // Authentication logic: require login for collaboration mode, allow public access for preview mode
  useEffect(() => {
    if (!isPreviewMode && !user && isAuthResolved) {
      // Redirect to login for collaboration mode without authentication
      window.location.href = '/login';
      return;
    }
  }, [isPreviewMode, user, isAuthResolved]);

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  useEffect(() => {
    const fetchInitialContent = async () => {
      setIsLoadingContent(true);
      setErrorLoadingContent(null);
      try {
        const endpoint = isPreviewMode 
          ? `/collab-editor/get-doc-preview/${documentId}`
          : `/collab-editor/get-doc/${documentId}`;
        const response = await apiClient.get(endpoint);
        setInitialContent(response.data.initialContent || '');
      } catch (err) {
        console.error('Error initializing collaborative document:', err.response?.status || err.message);
        setErrorLoadingContent(err.response?.data?.message || err.message || 'Error loading document.');
        setInitialContent(''); // Set to empty string on error to allow editor to load
      } finally {
        setIsLoadingContent(false);
      }
    };

    if (documentId) {
      fetchInitialContent();
    }
  }, [documentId, isPreviewMode]);

  // Callback for QuillYjsEditor to inform parent about selection changes
  const handleSelectionChange = useCallback((text, range) => {
    console.log("[CollabEditorPage] Parent Selection changed:", { text, range });

    if (range === null) {
      // Editor lost focus. We want to keep the current selectedText and highlightedRange.
      // So, we do NOT call setSelectedText here if we want to preserve the text display in chat.
      console.log("[CollabEditorPage] Editor lost focus, keeping current selectedText and highlight.");
      return; 
    }

    // If range is not null, it means there's a valid selection or caret position within the editor.
    // Update selectedText with the text from this selection.
    setSelectedText(text);

    if (range.length === 0) {
      // User clicked within the editor, placing the caret (no actual text selection).
      // This should clear any existing highlight.
      console.log("[CollabEditorPage] Caret placed in editor (no selection length), clearing highlight.");
      setHighlightedRange(null);
    } else {
      // A new selection with length > 0 was made. Update the highlight to this new range.
      console.log("[CollabEditorPage] New selection made, updating highlight to new range:", range);
      setHighlightedRange(range);
    }
  }, [setSelectedText, setHighlightedRange]);

  // Effect for visual highlighting based on highlightedRange (local UI effect)
  useEffect(() => {
    const quill = quillRef.current; // quillRef is set by CollabEditorPageContent
    console.log('[CollabEditorPage] Highlight effect triggered. HighlightedRange:', highlightedRange);
    if (quill && highlightedRange) {
      console.log('[CollabEditorPage] Applying highlight with animation for user selection.');
      // applyHighlightWithAnimation uses background: '#ffff00' and color: '#000000'
      applyHighlightWithAnimation(quill, highlightedRange.index, highlightedRange.length);
    } else if (quill && !highlightedRange) {
      console.log('[CollabEditorPage] Removing USER SELECTION highlight because highlightedRange is null/empty.');
      // Specifically remove formats set by applyHighlightWithAnimation
      quill.formatText(0, quill.getLength(), {
        background: false, // Resets background set to #ffff00
        color: false,      // Resets color set to #000000
      }, 'silent');
    }
    return () => {
      if (quill && quillRef.current) {
         removeAllQuillHighlights(quill);
      }
    };
  }, [highlightedRange]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // CONDITIONAL RETURNS - AFTER ALL HOOKS
  // If still loading auth or beta features, show skeleton
  if (authLoading || isLoadingBetaFeatures || !isAuthResolved) {
    return <CollabEditorSkeleton />;
  }

  // If no access to collab feature, show error message
  if (!hasCollabAccess) {
    return (
      <div className="collab-editor-overlay">
        <div className="collab-editor-content collab-editor-error">
          <h2>Zugriff verweigert</h2>
          <p>Die kollaborative Bearbeitung ist ein Beta-Feature, das in deinem Profil aktiviert werden muss.</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <Link to="/profile/labor" className="button primary">Zum Profil (Labor)</Link>
            <Link to="/" className="button secondary">Zurück zur Startseite</Link>
          </div>
        </div>
      </div>
    );
  }

  let content;
  if (isLoadingContent || initialContent === undefined) {
    content = <CollabEditorSkeleton />; // NEU: Skeleton anzeigen
  } else if (errorLoadingContent && initialContent === '') { // Show error only if content failed and is empty
     content = (
      <div className="collab-editor-content collab-editor-error">
        <p>Fehler beim Laden des Dokuments: {errorLoadingContent}</p>
      </div>
    );
  } else {
    content = (
      <div className="collab-editor-content">
        <CollabEditorPageContent 
          documentId={documentId} 
          initialContentForEditor={initialContent}
          quillRef={quillRef}
          selectedTextState={selectedText}
          setSelectedTextState={setSelectedText}
          highlightedRangeState={highlightedRange}
          setHighlightedRangeState={setHighlightedRange}
          isEditingState={isEditing}
          onSelectionChangeCallback={handleSelectionChange}
          isPreviewMode={isPreviewMode}
        />
      </div>
    );
  }

  return (
    <div className={`collab-editor-overlay ${isPreviewMode ? 'preview-mode' : ''}`}>
      {isPreviewMode && (
        <div className="preview-mode-banner">
          <span className="preview-mode-title">👁️ Review-Modus</span>
          <span className="preview-mode-text">
            Du befindest dich im Review-Modus. Du kannst Text markieren und Kommentare schreiben, aber nicht bearbeiten.
          </span>
        </div>
      )}
      {content}
      <FloatingToolbar documentId={documentId} isPreviewMode={isPreviewMode} />
    </div>
  );
};

// Inner component to use Zustand store for collaborative editor state
const CollabEditorPageContent = ({
  documentId,
  quillRef,
  selectedTextState,
  setSelectedTextState,
  highlightedRangeState,
  setHighlightedRangeState,
  isEditingState,
  onSelectionChangeCallback,
  initialContentForEditor,
  isPreviewMode
}) => {
  const { ydoc, ytext, provider, awareness, connectionStatus, setQuillInstance } = useCollabEditorStore();
  const { generatedText, setGeneratedText } = useGeneratedTextStore();
  const [isAdjusting, setIsAdjusting] = useState(false);

  const handleQuillInstanceReady = useCallback((instance) => {
    quillRef.current = instance;
    setQuillInstance(instance);
    console.log("[CollabEditorPageContent] Quill instance ready via CollabEditorPageContent:", instance);

    if (ytext) {
      const ytextObserver = () => {
        if (quillRef.current) {
          setGeneratedText(quillRef.current.root.innerHTML);
        }
      };
      ytext.observe(ytextObserver);
      if (quillRef.current) setGeneratedText(quillRef.current.root.innerHTML);

      return () => {
        if (ytext && ytext.unobserve) ytext.unobserve(ytextObserver);
      };
    }
  }, [ytext, quillRef, setQuillInstance, setGeneratedText]);

  const handleAiResponse = useCallback((response) => {
    console.log("[CollabEditorPageContent] handleAiResponse received:", response);
    if (!ytext) {
      console.error("[CollabEditorPageContent] Yjs ytext is not available from context. Cannot apply AI changes.");
      return;
    }
    if (connectionStatus !== 'connected') {
      console.warn("[CollabEditorPageContent] Yjs provider not connected. AI changes might not sync.");
    }

    if (response && response.textAdjustment && response.textAdjustment.newText) {
      const { newText: adjustedText, type, range: aiProvidedRange } = response.textAdjustment;

      console.log("[CollabEditorPageContent] Applying AI adjustment. Type:", type, "AI Provided Range:", aiProvidedRange, "New Text:", adjustedText);

      ydoc.transact(() => { // Use ydoc from context for transactions
        if (type === 'selected' && aiProvidedRange && typeof aiProvidedRange.index === 'number' && typeof aiProvidedRange.length === 'number') {
          console.log('[CollabEditorPageContent] YJS: Deleting text. Index:', aiProvidedRange.index, 'Length:', aiProvidedRange.length);
          ytext.delete(aiProvidedRange.index, aiProvidedRange.length);
          console.log('[CollabEditorPageContent] YJS: Inserting text at Index:', aiProvidedRange.index, 'with NewText:', adjustedText);
          ytext.insert(aiProvidedRange.index, adjustedText);
          
          console.log('[CollabEditorPageContent] YJS: Text after ytext ops:', ytext.toString().substring(aiProvidedRange.index, aiProvidedRange.index + (adjustedText ? adjustedText.length : 0) + 20));
          
          if (quillRef.current) {
            console.log('[CollabEditorPageContent] About to call applyNewTextHighlight for AI text.');
            applyNewTextHighlight(quillRef.current, aiProvidedRange.index, adjustedText ? adjustedText.length : 0);
          }
        } else if (type === 'full') {
          if (ytext.length > 0) ytext.delete(0, ytext.length);
          // Dynamically import Quill only when needed for full text replacement
          import('quill').then(({ default: Quill }) => {
            const tempQuill = new Quill(document.createElement('div'));
            tempQuill.clipboard.dangerouslyPasteHTML(0, adjustedText);
            const delta = tempQuill.getContents();
            ytext.applyDelta(delta.ops);
            setHighlightedRangeState(null); 
            setSelectedTextState('');
          }).catch(console.error);
        }
      }, 'ai-assistant'); // Add AI operation metadata
    } else if (response && response.response) {
      console.log("[CollabEditorPageContent] AI Response (non-adjustment):", response.response);
    }
  }, [ytext, ydoc, highlightedRangeState, setSelectedTextState, setHighlightedRangeState, quillRef, connectionStatus]); // Dependencies: ytext, ydoc, connectionStatus
  

  return (
    <div className="collab-editor-main-content">
      <div className="collab-editor-chat-column">
        {/* Render EditorChat only if Yjs is ready, or handle loading state inside EditorChat */}
        {ytext && connectionStatus === 'connected' ? (
          <EditorChat 
            isEditing={isEditingState} 
            isCollabEditor={true}
            isPreviewMode={isPreviewMode}
            value={generatedText}
            selectedText={selectedTextState}
            quillRef={quillRef}
            isAdjusting={isAdjusting}
            setIsAdjusting={setIsAdjusting}
            handleAiResponse={handleAiResponse}
          />
        ) : (
          <p>Verbinde Chat...</p>
        )}
      </div>
      <div className="collab-editor-quill-column">
        <QuillYjsEditor 
          documentId={documentId} 
          initialContent={initialContentForEditor}
          onQuillInstanceReady={handleQuillInstanceReady}
          onSelectionChange={onSelectionChangeCallback}
          readOnly={isPreviewMode}
        />
      </div>
    </div>
  );
}

export default CollabEditorPage; 