import React from 'react';
import PropTypes from 'prop-types';
import { AntragProvider } from './AntragContext';
import { AntragForm } from './AntragForm';
import ErrorBoundary from '../../../components/ErrorBoundary';

export const AntragPage = ({ showHeaderFooter = true }) => {
  return (
    <div className={showHeaderFooter ? 'with-header' : 'no-header'}>
      <ErrorBoundary>
        <AntragProvider>
          <AntragForm />
        </AntragProvider>
      </ErrorBoundary>
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