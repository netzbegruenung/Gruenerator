import Quill from 'quill';

// Whitelist attributes for block elements (like div)
const Block = Quill.import('blots/block');
Block.allowedChildren.forEach(def => {
    if (def.name === Block.blotName) { // Ensure we modify the correct definition
        def.allowedAttributes = def.allowedAttributes || [];
        if (!def.allowedAttributes.includes('class')) {
            def.allowedAttributes.push('class');
        }
        if (!def.allowedAttributes.includes('data-platform')) {
            def.allowedAttributes.push('data-platform');
        }
    }
});
// Fallback if the above method doesn't work (directly on Block)
// Block.allowedAttributes = Block.allowedAttributes || [];
// Block.allowedAttributes.push('class', 'data-platform');

export const PROTECTED_HEADERS = [
  'TWITTER:',
  'FACEBOOK:',
  'INSTAGRAM:',
  'LINKEDIN:',
  'AKTIONSIDEEN:',
  'INSTAGRAM REEL:'
];

export const EDITOR_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'indent', 'link', 'image', 'code-block',
  'script', 'align', 'color', 'background',
  'platform-section'
];

export const EDITOR_MODULES = {
  toolbar: {
    container: '#toolbar',
    handlers: {
      undo: function() { this.quill.history.undo(); },
      redo: function() { this.quill.history.redo(); },
    },
  },
  clipboard: { matchVisual: true },
  history: { delay: 1000, maxStack: 100, userOnly: false },
}; 