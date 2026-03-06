import domReady from '@wordpress/dom-ready';

import './index.scss';

import './blocks/hero-block/block';
import './blocks/about-block/block';
import './blocks/hero-image-block/block';
import './blocks/meine-themen-block/block';
import './blocks/link-kacheln/block';
import './blocks/contact-form-block/block';
import './blocks/image-grid-block/block';

domReady(() => {
  console.log('DOM ist bereit, Blöcke initialisiert');
  console.log('Gruenerator plugin script wurde geladen');
});
