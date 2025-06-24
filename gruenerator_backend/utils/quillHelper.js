import Quill from 'quill';

/**
 * Create a Quill instance for server-side use (HTML conversion)
 * @returns {Quill} Configured Quill instance
 */
export function createQuill() {
  // Create a temporary DOM element for Quill
  const tempDiv = document.createElement('div');
  
  // Minimal Quill configuration for server-side use
  const quill = new Quill(tempDiv, {
    theme: 'bubble',
    modules: {
      toolbar: false // No toolbar needed for conversion
    },
    formats: [
      'bold', 'italic', 'underline', 'header',
      'list', 'link', 'blockquote'
    ]
  });
  
  return quill;
}