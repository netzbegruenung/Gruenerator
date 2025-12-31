import React from 'react';

// Skeleton Loader für Generator-Karten im Ladezustand
const GeneratorCardSkeleton: React.FC = () => {
  return (
    <div className="gallery-item-card generator-card skeleton">
      <div className="skeleton-title"></div>
      <div className="skeleton-description"></div>
      <div className="skeleton-date"></div>
    </div>
  );
};

export default GeneratorCardSkeleton; 