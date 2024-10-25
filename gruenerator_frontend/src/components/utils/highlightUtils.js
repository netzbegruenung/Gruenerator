export const applyHighlight = (quill, index, length, color = '#ffff00') => {
  if (quill && typeof index === 'number' && typeof length === 'number') {
    // Apply the highlight directly using formatText with 'silent' source
    quill.formatText(index, length, {
      background: color,
      color: '#000000',
    }, 'silent');
  }
};

export const applyHighlightWithAnimation = (quill, index, length) => {
    applyHighlight(quill, index, length, '#ffff00');
  };
  

  export const removeAllHighlights = (quill) => {
    if (quill) {
      // Remove background and color formatting from the entire content
      quill.formatText(0, quill.getLength(), {
        background: false,
        color: false,
      }, 'silent');
    }
  };
  

  export const applyAdjustmentHighlight = (quill, index, length, keepFormatting = true) => {
    if (quill && typeof index === 'number' && typeof length === 'number') {
      if (keepFormatting) {
        quill.formatText(index, length, {
          color: '#008000',
          background: '#e6ffe6',
        }, 'silent');
      } else {
        quill.formatText(index, length, {
          color: null,
          background: null,
        }, 'silent');
      }
    }
  };
  