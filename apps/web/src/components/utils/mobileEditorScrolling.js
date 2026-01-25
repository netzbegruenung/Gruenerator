/**
 * Utility-Funktion zur Aktivierung des mobilen Scrollings im Quill-Editor
 *
 * @param {React.RefObject} quillRef - Referenz zum Quill-Editor
 * @param {boolean} isEditing - Flag, ob der Editor im Bearbeitungsmodus ist
 * @returns {Function} Cleanup-Funktion zum Entfernen des Event Listeners
 */
export const enableMobileEditorScrolling = (quillRef, isEditing) => {
  function applyMobileScrolling() {
    if (quillRef.current) {
      const editor = quillRef.current;
      if (editor && editor.root) {
        // Prüfen, ob es ein mobiles Gerät ist (max-width: 768px)
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        // Nur auf mobilen Geräten Scrolling aktivieren
        if (isMobile && isEditing) {
          // Wichtig: !important verwenden, um CSS-Regeln zu überschreiben
          editor.root.style.setProperty('overflow-y', 'auto', 'important');
          // Eine Höhenbegrenzung setzen, damit Scrolling aktiviert wird
          const viewportHeight = window.innerHeight;
          const editorPosition = editor.root.getBoundingClientRect().top;
          const maxHeight = viewportHeight - editorPosition - 20; // 20px Puffer
          editor.root.style.setProperty('max-height', `${maxHeight}px`, 'important');
          console.log('[Editor] Mobile Scrolling aktiviert:', { maxHeight, overflowY: 'auto' });
        } else {
          // Zurücksetzen auf CSS-Standardwerte
          editor.root.style.removeProperty('overflow-y');
          editor.root.style.removeProperty('max-height');
          console.log('[Editor] Scrolling zurückgesetzt');
        }
      }
    }
  }

  // Initial anwenden
  applyMobileScrolling();

  // Bei Größenänderung des Fensters neu anwenden
  window.addEventListener('resize', applyMobileScrolling);

  // Cleanup-Funktion zurückgeben
  return () => {
    window.removeEventListener('resize', applyMobileScrolling);
  };
};
