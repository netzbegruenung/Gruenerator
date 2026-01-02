import React from 'react';
import AntragGenerator from './AntragGenerator';

export const AntragPage = ({ showHeaderFooter = true }) => {
  return (
    <AntragGenerator showHeaderFooter={showHeaderFooter} />
  );
};

AntragPage.defaultProps = {
  showHeaderFooter: true
};

export default AntragPage;
