import React, { useContext, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

// Import and register Quill formats
import QuillList from 'quill/formats/list';
import QuillBlockquote from 'quill/formats/blockquote';
import QuillHeader from 'quill/formats/header';
import QuillIndent from 'quill/formats/indent';
import { AlignAttribute, AlignStyle } from 'quill/formats/align';
import QuillCodeBlock from 'quill/formats/code';

// Register formats
Quill.register(QuillList);
Quill.register(QuillBlockquote);
Quill.register(QuillHeader);
Quill.register(QuillIndent);
Quill.register(AlignAttribute);
Quill.register(AlignStyle);
Quill.register(QuillCodeBlock);

import { EditorToolbar } from './EditorToolbar';
import { FormContext } from '../../utils/FormContext';
import { enableMobileEditorScrolling } from '../../utils/mobileEditorScrolling';
import {
  EDITOR_FORMATS,
  EDITOR_MODULES
} from './utils/constants';
import {
  useTextHighlighting,
  useProtectedHeaders
} from './hooks';

const Editor = React.memo(({ setEditorInstance = () => {} }) => {
  const {
    value,
    updateValue,
    isEditing,
    isAdjusting,
    activePlatform,
    facebookValue,
    instagramValue,
    twitterValue,
    linkedinValue,
    reelScriptValue,
    actionIdeasValue,
    handleAiAdjustment,
    selectedText,
    setSelectedText,
    highlightedRange,
    setHighlightedRange,
    adjustText,
    error,
    adjustmentText,
    removeAllHighlights,
    originalContent,
    setOriginalContent,
    setIsApplyingAdjustment,
    aiAdjustment,
    setIsAdjusting,
    setAdjustmentText,
    setAiAdjustment
  } = useContext(FormContext);

  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const isProgrammaticChange = useRef(false);
  const [localValue, setLocalValue] = useState(value || '');
  const [showAdjustButton, setShowAdjustButton] = useState(false);
  const isTouchDevice = useCallback(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, [])();

  const formats = useMemo(() => EDITOR_FORMATS, []);
  const modules = useMemo(() => EDITOR_MODULES, []);

  // Aktualisiere localValue wenn sich value im Context ändert
  useEffect(() => {
    if (activePlatform) {
      const platformContent = {
        facebook: facebookValue,
        instagram: instagramValue,
        twitter: twitterValue,
        linkedin: linkedinValue,
        reelScript: reelScriptValue,
        actionIdeas: actionIdeasValue
      }[activePlatform] || '';
      setLocalValue(platformContent);
    } else {
      setLocalValue(value || '');
    }
  }, [
    value,
    activePlatform,
    facebookValue,
    instagramValue,
    twitterValue,
    linkedinValue,
    reelScriptValue,
    actionIdeasValue
  ]);

  // Aktualisiere Quill wenn sich localValue ändert
  useEffect(() => {
    const quill = quillRef.current;
    if (quill && !isProgrammaticChange.current) {
      console.log('[Editor] Updating Quill content from localValue change using dangerouslyPasteHTML');
      isProgrammaticChange.current = true;
      try {
        console.log('[Editor] Pasting HTML. Content type:', typeof localValue, 'Content starts with:', localValue?.substring(0, 50));
        quill.setContents([], 'api'); // Clear existing content
        quill.clipboard.dangerouslyPasteHTML(0, localValue || '', 'api');
        console.log('[Editor] HTML content pasted successfully');
      } catch (error) {
        console.error('[Editor] Error pasting HTML content:', error);
        console.log('[Editor] Falling back to setText on error. Failed content type:', typeof localValue, 'Content starts with:', localValue?.substring(0, 50));
        // Fallback to plain text if pasting HTML fails
        quill.setText(localValue || '', 'api'); 
      } finally {
        setTimeout(() => {
          isProgrammaticChange.current = false;
        }, 0);
      }
    }
  }, [localValue]);

  const handleChange = useCallback((delta, oldDelta, source) => {
    if (isProgrammaticChange.current) {
      console.log('[Editor] handleChange blocked by isProgrammaticChange');
      return;
    }

    const quill = quillRef.current;
    if (!quill) return;

    const currentContent = quill.root.innerHTML;
    console.log(`[Editor] handleChange fired. Source: ${source}, Content length: ${currentContent?.length}`);

    if (currentContent === '<p><br></p>') {
      console.log('[Editor] handleChange detected empty content.');
      if (source !== 'user') {
        console.log('[Editor] handleChange blocked update for empty content with non-user source.');
        return;
      }
      console.log('[Editor] handleChange allowing update for empty content because source is user.');
    }

    setLocalValue(currentContent);
    if (isEditing && source === 'user') {
      console.log('[Editor] handleChange updating context value.');
      updateValue(currentContent);
    } else {
      console.log(`[Editor] handleChange did NOT update context. isEditing: ${isEditing}, source: ${source}`);
    }
  }, [isEditing, updateValue]);

  const setEditorContent = useCallback((content, format = 'html') => {
    console.log(`[Editor] setEditorContent called. Format: ${format}, Content length: ${content?.length ?? 'undefined'}`);
    const editor = quillRef.current;
    if (editor) {
      console.log('[Editor] Quill instance exists. Setting content...');
      isProgrammaticChange.current = true;
      try {
        if (format === 'html') {
          console.log('[Editor] Using HTML format for content. Content starts with:', content?.substring(0, 50));
          // const delta = editor.clipboard.convert(content); // Old method for Quill 1.x
          // console.log('[Editor] HTML conversion successful. Delta:', delta); 
          // editor.setContents(delta, 'silent');
          
          // New method for Quill 2.x
          editor.clipboard.dangerouslyPasteHTML(0, content, 'api');
          console.log('[Editor] Pasted HTML content using dangerouslyPasteHTML.');
        } else {
          console.log('[Editor] Using TEXT format for content.');
          editor.setText(content, 'silent');
        }
        setLocalValue(content);
        console.log('[Editor] Content set successfully.');
      } catch (error) {
        console.error("[Editor] Error setting content:", error);
        console.log('[Editor] Falling back to setText due to error.');
        editor.setText(content, 'silent');
        setLocalValue(content);
      } finally {
        console.log('[Editor] Resetting isProgrammaticChange flag.');
        setTimeout(() => { isProgrammaticChange.current = false; }, 0);
      }
    } else {
      console.warn('[Editor] setEditorContent called but Quill instance is not available yet.');
    }
  }, [setLocalValue]);

  const getEditorInterface = useCallback(() => ({
    setContent: setEditorContent,
    getHtmlContent: () => {
      return quillRef.current?.root.innerHTML;
    },
    getDelta: () => {
      return quillRef.current?.getContents();
    },
    focus: () => {
      quillRef.current?.focus();
    },
    getInstance: () => quillRef.current,
  }), [setEditorContent]);

  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      console.log('[Editor] Initializing Quill...');
      try {
        console.log('[Editor] Quill version information:', Quill.version);
        console.log('[Editor] Available Quill formats:', formats);
        console.log('[Editor] Available Quill modules:', Object.keys(modules));
        
        const quillInstance = new Quill(editorRef.current, {
          modules: modules,
          formats: formats,
          theme: 'snow',
          placeholder: isEditing ? 'Start writing...' : '',
          readOnly: !isEditing || isAdjusting,
        });
        

        console.log(`[Editor] Initial localValue length: ${localValue?.length ?? 'undefined'}`);
        if (localValue) {
          console.log('[Editor] Setting initial content during Quill initialization using dangerouslyPasteHTML.');
          console.log('[Editor] Initial content starts with:', localValue.substring(0, 50));
          try {
            // Clear potential placeholder before pasting
            quillInstance.setContents([], 'api'); 
            quillInstance.clipboard.dangerouslyPasteHTML(0, localValue || '', 'api');
            console.log('[Editor] Pasted initial HTML content.');
          } catch (error) {
            console.error('[Editor] Error during initial content pasting:', error);
            console.log('[Editor] Falling back to setText for initial content');
            quillInstance.setText(localValue, 'silent');
          }
        }

        quillInstance.on('text-change', handleChange);
        quillRef.current = quillInstance;
        console.log('[Editor] Quill initialized and ref set.');

        return () => {
          console.log('[Editor] Cleaning up Quill instance.');
          quillInstance.off('text-change', handleChange);
          quillRef.current = null;
          const editorContainer = editorRef.current;
          if (editorContainer) {
              editorContainer.innerHTML = '';
          }
        };
      } catch (error) {
        console.error('[Editor] Error during Quill initialization:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (quillRef.current) {
      const shouldBeEnabled = isEditing && !isAdjusting;
      console.log(`[Editor] Updating readOnly status. isEditing: ${isEditing}, isAdjusting: ${isAdjusting}, Enabling editor: ${shouldBeEnabled}`);
      quillRef.current.enable(shouldBeEnabled);
    }
  }, [isEditing, isAdjusting]);

  const highlighting = useTextHighlighting(
    quillRef,
    setSelectedText,
    setHighlightedRange,
    setOriginalContent,
    isAdjusting
  );

  const applyAdjustment = useCallback((newText) => {
    const quill = quillRef.current;
    if (!quill) return;
    console.log('[TextAdjustment] applyAdjustment', {
      newTextLength: newText?.length,
      hasHighlightedRange: !!highlightedRange
    });
    
    if (highlightedRange) {
      console.log('[TextAdjustment] Applying selected-type adjustment', {
        newTextLength: newText.length,
        highlightedRange
      });
      
      isProgrammaticChange.current = true;
      quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
      quill.insertText(highlightedRange.index, newText, 'api');
      highlighting.applyNewTextHighlight(quill, highlightedRange.index, newText.length);
      setLocalValue(quill.root.innerHTML);
      setTimeout(() => { isProgrammaticChange.current = false; }, 0);
    } else {
      console.log('[TextAdjustment] Applying full-text adjustment');
      
      isProgrammaticChange.current = true;
      quill.setText(newText || '', 'api');
      highlighting.applyNewTextHighlight(quill, 0, newText.length);
      setLocalValue(quill.root.innerHTML);
      setTimeout(() => { isProgrammaticChange.current = false; }, 0);
    }
  }, [quillRef, highlightedRange, highlighting, setLocalValue]);

  const rejectAdjustment = useCallback(() => {
    const quill = quillRef.current;
     console.log('[TextAdjustment] Adjustment rejected');
    console.log('[TextAdjustment] Type:', aiAdjustment?.type, 'Range:', !!highlightedRange);
    
    isProgrammaticChange.current = true;
    if (aiAdjustment?.type === 'full' && quill) {
      console.log('[TextAdjustment] Processing full type rejection');
      setEditorContent(originalContent || '', 'html');
    } else if (highlightedRange && quill && originalContent) {
      console.log('[TextAdjustment] Processing selected type rejection');
      quill.deleteText(highlightedRange.index, highlightedRange.length, 'api');
      setEditorContent(originalContent, 'html');
      setLocalValue(quill.root.innerHTML);
    } else {
      console.warn('[TextAdjustment] Could not process rejection: Missing info or quill instance.');
      
      if (quill) setLocalValue(quill.root.innerHTML);
    }

    setIsAdjusting(false);
    setAdjustmentText('');
    setOriginalContent('');
    setAiAdjustment(null);
    if (quill) highlighting.removeAllHighlights(quill);
    setSelectedText('');
    setHighlightedRange(null);

    console.log('[Editor] Resetting isProgrammaticChange after rejection.');
    setTimeout(() => { isProgrammaticChange.current = false; }, 0);

    console.log('[TextAdjustment] rejectAdjustment completed');

  }, [
    originalContent,
    quillRef,
    aiAdjustment?.type,
    highlightedRange,
    setIsAdjusting,
    setAdjustmentText,
    setOriginalContent,
    setAiAdjustment,
    highlighting,
    setEditorContent,
    setLocalValue,
    setSelectedText,
    setHighlightedRange
  ]);

  useEffect(() => {
    if (adjustmentText && quillRef.current) {
       console.log('[Editor] Applying adjustment text effect.');
       applyAdjustment(adjustmentText);

       setIsAdjusting(false);
       setAdjustmentText('');
       setOriginalContent('');
       setAiAdjustment(null);
    }
  }, [adjustmentText, aiAdjustment?.type]);

  useProtectedHeaders(quillRef, updateValue, localValue, setLocalValue, isEditing);

  useEffect(() => {
    let contentToSet = value;
     if (activePlatform) {
      contentToSet = {
        facebook: facebookValue,
        instagram: instagramValue,
        twitter: twitterValue,
        linkedin: linkedinValue,
        reelScript: reelScriptValue,
        actionIdeas: actionIdeasValue
      }[activePlatform] || '';
    }
     const quill = quillRef.current;
     if (quill && (contentToSet !== localValue || quill.getLength() <= 1)) {
        console.log("[Editor] Syncing editor content due to external change OR empty editor", {
          platform: activePlatform,
          newContentLength: contentToSet?.length ?? 'undefined',
          currentLocalValueLength: localValue?.length ?? 'undefined',
          valuesDiffer: contentToSet !== localValue,
          isQuillEmpty: quill.getLength() <= 1
        });
        if (contentToSet !== localValue) {
          setEditorContent(contentToSet, 'html');
        } else if (quill.getLength() <= 1 && contentToSet) {
          console.log("[Editor] Quill reported empty, but content exists. Forcing setEditorContent.");
          setEditorContent(contentToSet, 'html');
        } else {
           console.log("[Editor] Skipping setEditorContent as values are the same and Quill is not reporting empty.");
        }
    }
  }, [
    value,
    activePlatform,
    facebookValue,
    instagramValue,
    twitterValue,
    linkedinValue,
    reelScriptValue,
    actionIdeasValue,
  ]);

  useEffect(() => {
    setEditorInstance(getEditorInterface());
  }, [setEditorInstance, getEditorInterface]);

  useEffect(() => {
    const quill = quillRef.current;
    if (quill) {
       console.log('[Editor] Adding selection-change handler.');
       const selectionHandler = (range, oldRange, source) => {
         console.log(`[Editor] Selection change. Source: ${source}, Range: ${JSON.stringify(range)}`);
         if (source === 'user') {
           highlighting.handleSelectionChange(range, oldRange, source);
           setShowAdjustButton(range && range.length > 0 && isEditing && !isAdjusting);
         }
       };
      quill.on('selection-change', selectionHandler);
      return () => {
        console.log('[Editor] Removing selection-change handler.');
        quill.off('selection-change', selectionHandler);
      };
    }
  }, [highlighting, isEditing, isAdjusting]);

  useEffect(() => {
    const quill = quillRef.current;
     if (quill && isTouchDevice) {
       console.log('[Editor] Adding touchend handler for touch devices.');
       const editorRoot = quill.root;
       const handleTouchEnd = () => {
         setTimeout(() => {
            const range = quill.getSelection();
            if (range && range.length > 0) {
                highlighting.handleSelection(range);
                 highlighting.applyHighlightWithAnimation(quill, range.index, range.length);
                setShowAdjustButton(isEditing && !isAdjusting);
            } else if (range?.length === 0) {
                 setSelectedText('');
                setHighlightedRange(null);
                highlighting.removeAllHighlights(quill);
                setShowAdjustButton(false);
            }
        }, 100);
      };
       editorRoot.addEventListener('touchend', handleTouchEnd);
       console.log('[Editor] Touchend handler added.');
       return () => {
         console.log('[Editor] Removing touchend handler.');
         editorRoot.removeEventListener('touchend', handleTouchEnd);
       };
     }
   }, [
     highlighting,
     isTouchDevice,
     setSelectedText,
     setHighlightedRange,
     isEditing,
     isAdjusting
   ]);

  useEffect(() => {
    return enableMobileEditorScrolling(editorRef, isEditing);
  }, [isEditing]);

  return (
    <div className="text-editor">
      <EditorToolbar
        readOnly={!isEditing || isAdjusting}
        onAdjustText={adjustText}
        isAdjusting={isAdjusting}
        showAdjustButton={showAdjustButton}
        selectedText={selectedText}
        isEditing={isEditing}
        removeAllHighlights={() => quillRef.current && highlighting.removeAllHighlights(quillRef.current)}
        originalContent={originalContent}
      />
      <div ref={editorRef} style={{ minHeight: '200px', border: '1px solid #ccc' }} />
      {console.log('[Editor] Rendering. isEditing:', isEditing, 'isAdjusting:', isAdjusting)}
      {error && <p className="error-message">Error: {error}</p>}
    </div>
  );
});

Editor.propTypes = {
  setEditorInstance: PropTypes.func,
};

Editor.displayName = 'Editor';

export default React.memo(Editor);
