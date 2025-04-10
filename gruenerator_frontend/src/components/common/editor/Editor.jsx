import React, { useContext, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

import { EditorToolbar } from './EditorToolbar';
import { FormContext } from '../../utils/FormContext';
import { enableMobileEditorScrolling } from '../../utils/mobileEditorScrolling';
import {
  EDITOR_FORMATS,
  EDITOR_MODULES
} from './utils/constants';
import PlatformSectionBlot from './utils/PlatformSectionBlot';
import {
  useTextHighlighting,
} from './hooks';

// Register Quill modules ONCE, before any editor instance is created
Quill.register(PlatformSectionBlot);

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
        console.log('[Editor] HTML content to be pasted (dangerouslyPasteHTML):', localValue);
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

    // If the change comes from the user, Quill handles the visual update internally.
    // We don't need to update React state (localValue or context) on every keystroke.
    if (source === 'user') {
      // console.log('[Editor] User typing. handleChange does nothing.');
      return; // Exit early for user input
    }

    // --- Code below only runs for non-user ('api', 'silent') changes ---

    const currentContent = quill.root.innerHTML;
    console.log(`[Editor] handleChange fired for non-user source: ${source}, Content length: ${currentContent?.length}`);

    // Keep logic for handling programmatic empty content or other API changes if needed
    if (currentContent === '<p><br></p>') {
      console.log('[Editor] handleChange detected empty content from non-user source.');
      // Decide if you need to block or allow this for 'api' source
    }

    // Update localValue only for non-user changes, if still needed.
    // If localValue is solely derived from context props, this might be removable too.
    console.log(`[Editor] handleChange updating localValue because source is '${source}'`);
    console.log('[Editor] handleChange: Skipping setLocalValue for non-user source for testing.');

    // Context update logic is removed from here. It will happen on save.

  // Dependencies might change based on whether setLocalValue is kept/removed
  }, []);

  const setEditorContent = useCallback((content, format = 'html') => {
    console.log(`[Editor] setEditorContent called. Format: ${format}, Content length: ${content?.length ?? 'undefined'}`);
    const editor = quillRef.current;
    if (editor) {
      console.log('[Editor] Quill instance exists. Setting content...');
      isProgrammaticChange.current = true;
      try {
        if (format === 'html') {
          console.log('[Editor] Using HTML format for content. Content starts with:', content?.substring(0, 50));
          console.log('[Editor] HTML content to be pasted via setEditorContent (dangerouslyPasteHTML):', content);
          
          // New method for Quill 2.x
          editor.setContents([], 'api'); // Clear first
          editor.clipboard.dangerouslyPasteHTML(0, content || '', 'api');
          console.log('[Editor] Pasted HTML content using dangerouslyPasteHTML via setEditorContent.');
        } else {
          console.log('[Editor] Using TEXT format for content.');
          editor.setText(content || '', 'silent');
        }
        console.log('[Editor] Content set successfully via setEditorContent.');
      } catch (error) {
        console.error("[Editor] Error setting content:", error);
        console.log('[Editor] HTML that failed:', content);
        console.log('[Editor] Falling back to setText due to error.');
        editor.setText(content || '', 'silent');
      } finally {
        console.log('[Editor] Resetting isProgrammaticChange flag in setEditorContent.');
        setTimeout(() => { isProgrammaticChange.current = false; }, 0);
      }
    } else {
      console.warn('[Editor] setEditorContent called but Quill instance is not available yet.');
    }
  }, []);

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
          modules: {
            ...modules,
            toolbar: {
              container: '#toolbar',
            }
          },
          formats: formats,
          theme: 'snow',
          placeholder: isEditing ? 'Start writing...' : '',
          readOnly: !isEditing || isAdjusting,
        });
        

        console.log(`[Editor] Initial localValue length: ${localValue?.length ?? 'undefined'}`);
        if (localValue) {
          console.log('[Editor] Setting initial content during Quill initialization using dangerouslyPasteHTML.');
          console.log('[Editor] Initial content starts with:', localValue.substring(0, 50));
          console.log('[Editor] Initial HTML content to be pasted:', localValue);
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
  }, [formats, modules, handleChange]);

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
      setTimeout(() => { isProgrammaticChange.current = false; }, 0);
    } else {
      console.log('[TextAdjustment] Applying full-text adjustment');
      
      isProgrammaticChange.current = true;
      setEditorContent(newText, 'html');
      highlighting.applyNewTextHighlight(quill, 0, newText?.length || 0);
      setTimeout(() => { isProgrammaticChange.current = false; }, 0);
    }
  }, [quillRef, highlightedRange, highlighting, setEditorContent /*setLocalValue*/]);

  const rejectAdjustment = useCallback(() => {
    const quill = quillRef.current;
     console.log('[TextAdjustment] Adjustment rejected');
    console.log('[TextAdjustment] Type:', aiAdjustment?.type, 'Range:', !!highlightedRange);
    
    isProgrammaticChange.current = true;
    if (originalContent !== undefined) {
      console.log('[TextAdjustment] Restoring original content using setEditorContent.');
      setEditorContent(originalContent || '', 'html');
    } else {
        console.warn('[TextAdjustment] Cannot reject: Original content is missing.');
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
    setIsAdjusting,
    setAdjustmentText,
    setOriginalContent,
    setAiAdjustment,
    highlighting,
    setEditorContent,
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
  }, [adjustmentText, aiAdjustment?.type, applyAdjustment, setIsAdjusting, setAdjustmentText, setOriginalContent, setAiAdjustment]);

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
     if (quill) {
        const currentQuillHTML = quill.root.innerHTML;
        const isQuillEffectivelyEmpty = currentQuillHTML === '<p><br></p>';
        const needsUpdate = contentToSet !== currentQuillHTML;

        if (needsUpdate) {
          console.log("[Editor] Syncing editor content due to external change.", {
            platform: activePlatform,
            newContentLength: contentToSet?.length ?? 'undefined',
            currentQuillContentLength: currentQuillHTML?.length ?? 'undefined',
            isQuillEmpty: isQuillEffectivelyEmpty
          });
          console.log("[Editor] Content source before sync:", { activePlatform, value, facebookValue /*... add others if needed */});
          console.log("[Editor] Content to be set via sync:", contentToSet?.substring(0, 100) + "...");
          setEditorContent(contentToSet, 'html');
        } else {
           console.log("[Editor] Skipping content sync as Quill content matches target content.");
        }
     } else {
       console.log("[Editor] Skipping content sync: Quill not ready.");
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
    setEditorContent
  ]);

  useEffect(() => {
    setEditorInstance(getEditorInterface());
  }, [setEditorInstance, getEditorInterface]);

  useEffect(() => {
    const quill = quillRef.current;
    if (quill) {
       console.log('[Editor] Adding selection-change handler.');
       const selectionHandler = (range, oldRange, source) => {
         if (source === 'user') {
           highlighting.handleSelectionChange(range, oldRange, source);
           setShowAdjustButton(range && range.length > 0 && isEditing && !isAdjusting);
         }
       };
      quill.on('selection-change', selectionHandler);
      return () => {
        console.log('[Editor] Removing selection-change handler.');
        if (quillRef.current) {
           quillRef.current.off('selection-change', selectionHandler);
        }
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
           const currentQuill = quillRef.current;
           if (!currentQuill) return; 
           
            const range = currentQuill.getSelection();
            if (range && range.length > 0) {
                highlighting.handleSelection(range);
                 highlighting.applyHighlightWithAnimation(currentQuill, range.index, range.length);
                setShowAdjustButton(isEditing && !isAdjusting);
            } else if (range?.length === 0) {
                 setSelectedText('');
                setHighlightedRange(null);
                highlighting.removeAllHighlights(currentQuill);
                setShowAdjustButton(false);
            }
        }, 100);
      };
       editorRoot.addEventListener('touchend', handleTouchEnd);
       console.log('[Editor] Touchend handler added.');
       return () => {
         console.log('[Editor] Removing touchend handler.');
         if (editorRoot && editorRoot.isConnected) {
             editorRoot.removeEventListener('touchend', handleTouchEnd);
         }
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
      {error && <p className="error-message">Error: {error}</p>}
    </div>
  );
});

Editor.propTypes = {
  setEditorInstance: PropTypes.func,
};

Editor.displayName = 'Editor';

export default React.memo(Editor);
