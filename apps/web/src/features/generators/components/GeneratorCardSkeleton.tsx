import React, { memo } from 'react';

/**
 * Skeleton Loader for Generator Cards during loading state.
 * Memoized since it has no props and renders static content.
 */
const GeneratorCardSkeleton: React.FC = memo(() => {
  return (
    <div className="gallery-item-card generator-card skeleton">
      <div className="skeleton-title" />
      <div className="skeleton-description" />
      <div className="skeleton-date" />
    </div>
  );
});

GeneratorCardSkeleton.displayName = 'GeneratorCardSkeleton';

export default GeneratorCardSkeleton;
