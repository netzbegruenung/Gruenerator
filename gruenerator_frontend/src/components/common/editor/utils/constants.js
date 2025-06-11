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
  toolbar: [ // Define toolbar structure directly
    [{ 'header': [1, 2, 3, false] }], // Headers H1, H2, H3, and normal text
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['link', 'image'],
    ['emoji'], // Add the emoji button
    ['clean'], // Add clean formatting button
    ['undo', 'redo'] // Use custom handlers defined below if needed, or rely on Quill's default
  ],
  handlers: { // Keep custom handlers if they are still needed
      undo: function() { this.quill.history.undo(); },
      redo: function() { this.quill.history.redo(); },
      // Quill handles the emoji button automatically when the module is registered
  },
  clipboard: { matchVisual: true },
  history: { delay: 1000, maxStack: 100, userOnly: false },
  "emoji-textarea": true, // Enable the emoji module (basic setup)
  // You can add options for emoji-textarea here if needed, like custom icons:
  // "emoji-textarea": {
  //   buttonIcon: '<svg>...</svg>' // Example custom icon
  // }
}; 