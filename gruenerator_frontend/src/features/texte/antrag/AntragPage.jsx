import React from 'react';
import PropTypes from 'prop-types';
import AntragGenerator from './AntragGenerator';

export const AntragPage = ({ showHeaderFooter = true }) => {
  return (
    <AntragGenerator showHeaderFooter={showHeaderFooter} />
  );
};

AntragPage.propTypes = {
  showHeaderFooter: PropTypes.bool
};

AntragPage.defaultProps = {
  showHeaderFooter: true
};

export default AntragPage; 