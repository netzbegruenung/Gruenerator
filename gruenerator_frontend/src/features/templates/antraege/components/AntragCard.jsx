import React from 'react';
import PropTypes from 'prop-types';

// Placeholder for Antrag Card
const AntragCard = ({ antrag }) => {
  return (
    <div className="antrag-card"> {/* TODO: Define CSS */}
      <h3>{antrag.title}</h3>
      <p>{antrag.shortDescription}</p>
      {/* TODO: Add relevant details and actions for an Antrag */}
    </div>
  );
};

AntragCard.propTypes = {
  antrag: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    shortDescription: PropTypes.string, // Example field
    // Add other relevant fields for an Antrag
  }).isRequired,
};

export default AntragCard; 