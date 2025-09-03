import { Mark } from '@tiptap/core';

// Custom highlight mark for user selection (yellow)
export const SelectionHighlight = Mark.create({
  name: 'selectionHighlight',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'selection-highlight',
        style: 'background-color: #fff2b3; color: #464646;',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.selection-highlight',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setSelectionHighlight: () => ({ commands }) => {
        return commands.setMark(this.name);
      },
      toggleSelectionHighlight: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
      unsetSelectionHighlight: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

// Custom highlight mark for AI-generated text (green)
export const AIHighlight = Mark.create({
  name: 'aiHighlight',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'ai-highlight',
        style: 'background-color: #dcffe4; color: #2d5a3d;',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.ai-highlight',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setAIHighlight: () => ({ commands }) => {
        return commands.setMark(this.name);
      },
      toggleAIHighlight: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
      unsetAIHighlight: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

// Utility functions for applying highlights
export const applyHighlight = (editor, from, to, type = 'selection') => {
  if (!editor || typeof from !== 'number' || typeof to !== 'number') {
    console.warn('[TipTap Highlights] Invalid editor or position parameters');
    return false;
  }

  try {
    const markName = type === 'ai' ? 'aiHighlight' : 'selectionHighlight';
    
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .setMark(markName)
      .run();
    
    console.log(`[TipTap Highlights] Applied ${type} highlight from ${from} to ${to}`);
    return true;
  } catch (error) {
    console.error('[TipTap Highlights] Error applying highlight:', error);
    return false;
  }
};

export const applyNewTextHighlight = (editor, from, length) => {
  const to = from + length;
  return applyHighlight(editor, from, to, 'ai');
};

export const applyHighlightWithAnimation = (editor, from, length) => {
  const to = from + length;
  const success = applyHighlight(editor, from, to, 'selection');
  
  if (success) {
    // Add a subtle animation class that can be styled in CSS
    setTimeout(() => {
      const highlightElements = document.querySelectorAll('.selection-highlight');
      highlightElements.forEach(el => {
        el.classList.add('highlight-animate');
        setTimeout(() => el.classList.remove('highlight-animate'), 500);
      });
    }, 50);
  }
  
  return success;
};

export const removeAllHighlights = (editor, type = 'all') => {
  if (!editor) {
    console.warn('[TipTap Highlights] No editor instance provided');
    return false;
  }

  try {
    const chain = editor.chain().focus();
    
    if (type === 'all' || type === 'selection') {
      chain.selectAll().unsetMark('selectionHighlight');
    }
    
    if (type === 'all' || type === 'ai') {
      chain.selectAll().unsetMark('aiHighlight');
    }
    
    chain.run();
    console.log(`[TipTap Highlights] Removed ${type} highlights`);
    return true;
  } catch (error) {
    console.error('[TipTap Highlights] Error removing highlights:', error);
    return false;
  }
};

export const applyAdjustmentHighlight = (editor, from, length, keepFormatting = true) => {
  if (keepFormatting) {
    return applyNewTextHighlight(editor, from, length);
  } else {
    // Remove highlights from the specified range
    if (!editor || typeof from !== 'number' || typeof length !== 'number') {
      return false;
    }

    try {
      const to = from + length;
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetMark('aiHighlight')
        .unsetMark('selectionHighlight')
        .run();
      
      console.log(`[TipTap Highlights] Removed highlights from ${from} to ${to}`);
      return true;
    } catch (error) {
      console.error('[TipTap Highlights] Error removing adjustment highlight:', error);
      return false;
    }
  }
};

// Helper function to get current selection range
export const getCurrentSelection = (editor) => {
  if (!editor) return null;
  
  const { from, to, empty } = editor.state.selection;
  
  if (empty) return null;
  
  return {
    from,
    to,
    length: to - from,
    text: editor.state.doc.textBetween(from, to, ' ')
  };
};

// Helper function to check if a range has specific highlight
export const hasHighlight = (editor, from, to, type = 'selection') => {
  if (!editor) return false;
  
  const markName = type === 'ai' ? 'aiHighlight' : 'selectionHighlight';
  const { state } = editor;
  
  try {
    const $from = state.doc.resolve(from);
    const $to = state.doc.resolve(to);
    return state.doc.rangeHasMark($from.pos, $to.pos, state.schema.marks[markName]);
  } catch (error) {
    console.error('[TipTap Highlights] Error checking highlight:', error);
    return false;
  }
};