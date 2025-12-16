import React from 'react';
import PropTypes from 'prop-types';
import { HiArrowLeft } from "react-icons/hi";

const BackButton = ({ onClick }) => (
  <button onClick={onClick} className="btn-secondary" aria-label="Zurück">
    <HiArrowLeft className="icon" /> Zurück
  </button>
);

BackButton.propTypes = {
  onClick: PropTypes.func.isRequired,
};

export default BackButton;