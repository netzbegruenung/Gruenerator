import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css'; // Optional: Import here if not done globally

const AntragCardSkeleton = () => {
  return (
    <div className="gallery-item-card antrag-card antrag-card-skeleton"> {/* Add a specific class for skeleton styling if needed */}
      <div> {/* Group title and tags */}
        {/* Skeleton for Title */}
        <h3 className="antrag-card-title">
          <Skeleton height={24} width={`80%`} /> {/* Adjust width/height as needed */}
        </h3>

        {/* Skeleton for Tags */}
        <div className="antrag-card-tags">
          <span className="antrag-card-tag"><Skeleton width={60} /></span>
          <span className="antrag-card-tag"><Skeleton width={50} /></span>
          <span className="antrag-card-tag"><Skeleton width={70} /></span>
        </div>
      </div>

      {/* Skeleton for Date */}
      <p className="antrag-card-date">
        <Skeleton width={120} />
      </p>
    </div>
  );
};

export default AntragCardSkeleton;
