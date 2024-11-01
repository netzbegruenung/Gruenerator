import React, { Suspense } from 'react';
import PropTypes from 'prop-types';

const SuspenseWrapper = ({ children }) => (
  <Suspense 
    fallback={null}
  >
    {children}
  </Suspense>
);

SuspenseWrapper.propTypes = {
  children: PropTypes.node.isRequired
};

export default SuspenseWrapper;