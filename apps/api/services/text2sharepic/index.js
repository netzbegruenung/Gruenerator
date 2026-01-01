/**
 * Text2Sharepic Service - Main Export
 *
 * AI-powered text-to-sharepic generation service.
 * Converts user descriptions into professional sharepics using
 * corporate design, component library, and zone templates.
 */

import { SharepicComposer, createSharepicComposer, quickGenerate } from './sharepicComposer.js';
import * as componentLibrary from './componentLibrary.js';
import * as zoneTemplates from './zoneTemplates.js';
import * as aiLayoutGenerator from './aiLayoutGenerator.js';
import * as layoutValidator from './layoutValidator.js';

export {
  SharepicComposer,
  createSharepicComposer,
  quickGenerate
};

export { componentLibrary, zoneTemplates, aiLayoutGenerator, layoutValidator };

export default {
  SharepicComposer,
  createSharepicComposer,
  quickGenerate,
  componentLibrary,
  zoneTemplates,
  aiLayoutGenerator,
  layoutValidator
};
