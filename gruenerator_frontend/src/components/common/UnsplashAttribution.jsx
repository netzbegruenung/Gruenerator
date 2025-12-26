import React from 'react';
import './UnsplashAttribution.css';

const UnsplashAttribution = ({
  photographer,
  profileUrl,
  photoUrl,
  compact = false,
  className = ''
}) => {
  if (!photographer) return null;

  if (compact) {
    return (
      <span className={`unsplash-attribution unsplash-attribution--compact ${className}`}>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Foto von ${photographer} auf Unsplash`}
        >
          {photographer}
        </a>
      </span>
    );
  }

  return (
    <div className={`unsplash-attribution ${className}`}>
      <span>Foto von </span>
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {photographer}
      </a>
      <span> auf </span>
      <a
        href="https://unsplash.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Unsplash
      </a>
    </div>
  );
};

export default UnsplashAttribution;
