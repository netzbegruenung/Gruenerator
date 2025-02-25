import React from 'react';
import PropTypes from 'prop-types';
import { AntragProvider } from './AntragContext';
import { AntragForm } from './AntragForm';

export const AntragPage = ({ showHeaderFooter = true }) => {
  return (
    <div className={showHeaderFooter ? 'with-header' : 'no-header'}>
      <AntragProvider>
        <AntragForm />
      </AntragProvider>
    </div>
  );
};

AntragPage.propTypes = {
  showHeaderFooter: PropTypes.bool
};

AntragPage.defaultProps = {
  showHeaderFooter: true
};

export default AntragPage; 