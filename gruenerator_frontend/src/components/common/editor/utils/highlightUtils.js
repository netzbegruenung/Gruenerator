export const applyHighlight = (quill, index, length, className = 'yellow') => {
  if (quill && typeof index === 'number' && typeof length === 'number') {
    // Apply the highlight using Quill's background format which maps to CSS classes
    quill.formatText(index, length, {
      background: className,
    }, 'silent');
  }
};

export const applyNewTextHighlight = (quill, index, length) => {
  if (quill && typeof index === 'number' && typeof length === 'number') {
    quill.formatText(index, length, {
      background: 'green',
    }, 'silent');
  }
};

export const applyHighlightWithAnimation = (quill, index, length) => {
  applyHighlight(quill, index, length, 'yellow');
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
      applyNewTextHighlight(quill, index, length);
    } else {
      quill.formatText(index, length, {
        background: false,
      }, 'silent');
    }
  }
}; 