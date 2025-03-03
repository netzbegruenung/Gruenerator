/**
 * Utility-Funktion zum automatischen Scrollen zum generierten Inhalt auf mobilen Geräten
 * 
 * @param {boolean} hasGeneratedContent - Flag, ob Inhalt generiert wurde
 * @returns {Function} Cleanup-Funktion zum Entfernen des Event Listeners
 */
export const scrollToGeneratedContent = (hasGeneratedContent) => {
  // Funktion zum Scrollen zum generierten Inhalt
  const scrollToContent = () => {
    // Nur auf mobilen Geräten ausführen
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    if (isMobile && hasGeneratedContent) {
      // Finde den Display-Container mit dem generierten Inhalt
      const displayContainer = document.getElementById('display-section-container');
      
      if (displayContainer) {
        // Sanftes Scrollen zum Container mit kleiner Verzögerung
        setTimeout(() => {
          // Berechne Position mit Offset für bessere Sichtbarkeit
          const yOffset = -20; // 20px Offset nach oben
          const y = displayContainer.getBoundingClientRect().top + window.pageYOffset + yOffset;
          
          window.scrollTo({
            top: y,
            behavior: 'smooth'
          });
          console.log('[ScrollToContent] Zu DisplaySection gescrollt');
        }, 500); // Längere Verzögerung für sicheres Rendering
      }
    }
  };

  // Beim ersten Aufruf ausführen
  if (hasGeneratedContent) {
    scrollToContent();
  }
  
  // Bei Größenänderung des Fensters neu prüfen
  window.addEventListener('resize', scrollToContent);
  
  // Cleanup-Funktion zurückgeben
  return () => {
    window.removeEventListener('resize', scrollToContent);
  };
}; 