import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import { HiCog } from "react-icons/hi";
import { BUTTON_LABELS, ARIA_LABELS } from '../utils/constants';

const GeneratePostButton = ({ onClick, loading, isRegenerateText }) => (
  <Button
    onClick={onClick}
    loading={loading}
    text={isRegenerateText ? BUTTON_LABELS.REGENERATE_TEXT : BUTTON_LABELS.GENERATE_TEXT}
    icon={<HiCog />}
    className="generate-post-button"
    ariaLabel={isRegenerateText ? ARIA_LABELS.REGENERATE_TEXT : ARIA_LABELS.GENERATE_POST}
  />
);

GeneratePostButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  isRegenerateText: PropTypes.bool,
};

export default GeneratePostButton;