// Text generation routes
export { default as alttextRouter } from './alttext.js';
export { default as grueneJugendRouter } from './gruene_jugend.js';
export { default as grueneratorAskRouter } from './gruenerator_ask.js';
export { default as leichteSpracheRouter } from './leichte_sprache.js';
export { default as socialRouter } from './social.js';
export { default as subtitlesRouter } from './subtitles.js';
export { default as textAdjustmentRouter } from './text_adjustment.js';
export { default as textImproverRouter } from './text_improver.js';
export { default as websiteRouter } from './website.js';

// Universal router exports multiple named routers
export {
  universalRouter,
  redeRouter,
  wahlprogrammRouter,
  buergeranfragenRouter,
} from './universal.js';
