import React from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";

const SubmitButton = ({ onClick, loading, success, text = 'Grünerieren' }) => (
  <button onClick={onClick} className={`form-button ${loading ? 'loading' : ''}`} aria-busy={loading}>
    <HiCog className={`icon ${loading ? 'loading-icon' : ''}`} />
    {loading ? '' : (success ? <svg className="checkmark" viewBox="0 0 24 24">
      <path d="M20 6L9 17l-5-5" />
    </svg> : text)}
  </button>
);

SubmitButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  text: PropTypes.string
};

export default SubmitButton;