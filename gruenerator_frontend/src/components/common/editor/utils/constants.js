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
  'script', 'align', 'color', 'background'
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