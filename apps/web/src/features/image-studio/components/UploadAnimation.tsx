import React from 'react';
import './UploadAnimation.css';

const UploadAnimation = ({ isActive = false }) => {
  return (
    <div
      className={`upload-animation ${isActive ? 'upload-animation--active' : ''}`}
      aria-hidden="true"
      role="presentation"
    >
      <div className="polaroid">
        <div className="polaroid__image">
          <div className="polaroid__developing">
            <svg className="polaroid__landscape" viewBox="0 0 40 30" fill="none">
              <circle cx="32" cy="8" r="4" fill="currentColor" className="polaroid__sun" />
              <path
                d="M0 30 L12 16 L20 22 L28 12 L40 24 L40 30 Z"
                fill="currentColor"
                className="polaroid__mountains"
              />
            </svg>
          </div>
          <div className="polaroid__overlay" />
        </div>
      </div>
    </div>
  );
};

export default UploadAnimation;
