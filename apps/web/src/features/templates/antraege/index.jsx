import React, { useEffect } from 'react';

// Placeholder for Antrag Gallery
const AntragGalleryPlaceholder = () => {
  useEffect(() => {
    console.log("Placeholder index.jsx wurde geladen!");
  }, []);

  return (
    <div>
      <h1>Antrags-Galerie</h1>
      <p>Dieser Bereich ist noch in Arbeit.</p>
      {/* 
        TODO: 
        - Fetch Anträge data (e.g., using antragService)
        - Implement state for search, filters, data
        - Use GalleryLayout with SearchBar, CategoryFilter (or specific filters)
        - Map data to AntragCard components
      */}
    </div>
  );
};

export default AntragGalleryPlaceholder; 