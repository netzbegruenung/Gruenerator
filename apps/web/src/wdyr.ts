/// <reference types="@welldone-software/why-did-you-render" />
import React from 'react';

if (import.meta.env.DEV) {
  const { default: whyDidYouRender } = await import('@welldone-software/why-did-you-render');
  whyDidYouRender(React, {
    trackAllPureComponents: false,
    trackHooks: true,
    logOnDifferentValues: true,
    collapseGroups: true,
  });
}
