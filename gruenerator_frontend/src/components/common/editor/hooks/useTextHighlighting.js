import { useCallback } from 'react';
import { 
  applyHighlight, 
  applyHighlightWithAnimation, 
  removeAllHighlights as removeHighlights,
  applyNewTextHighlight as applyNewHighlight,
  applyAdjustmentHighlight as applyAdjustment
} from '../utils/highlightUtils';
import { truncateMiddle } from '../textTruncation';

const useTextHighlighting = (
  quillRef, 
  setSelectedText, 
  setHighlightedRange, 
  setOriginalContent, 
  isAdjusting
) => {
  const handleSelection = useCallback((range) => {
    const editor = quillRef.current;
    if (!editor) return;

    if (range && range.length > 0 && !isAdjusting) {
      const text = editor.getText(range.index, range.length);
      const truncatedText = truncateMiddle(text, 200);
      setSelectedText(truncatedText);
      setHighlightedRange(range);
      setOriginalContent(editor.root.innerHTML);

      applyHighlightWithAnimation(editor, range.index, range.length);
    } else if (!isAdjusting && range?.length === 0) {
      setSelectedText('');
      setHighlightedRange(null);
      removeHighlights(editor);
    }
  }, [isAdjusting, setSelectedText, setHighlightedRange, setOriginalContent, quillRef]);

  const handleSelectionChange = useCallback((range) => {
    handleSelection(range);
  }, [handleSelection]);
  
  const removeAllHighlights = useCallback((editor) => {
    removeHighlights(editor || quillRef.current);
  }, [quillRef]);

  const applyNewTextHighlight = useCallback((editor, index, length) => {
    applyNewHighlight(editor || quillRef.current, index, length);
  }, [quillRef]);

  return {
    handleSelection,
    handleSelectionChange,
    removeAllHighlights,
    applyNewTextHighlight,
    applyHighlightWithAnimation: useCallback((editor, index, length) => {
      applyHighlightWithAnimation(editor || quillRef.current, index, length);
    }, [quillRef]),
    applyAdjustmentHighlight: useCallback((editor, index, length, keepFormatting) => {
      applyAdjustment(editor || quillRef.current, index, length, keepFormatting);
    }, [quillRef])
  };
};

export default useTextHighlighting; 