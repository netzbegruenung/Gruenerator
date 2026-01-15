/**
 * KI type configurations index
 */
export { greenEditTypeConfig, greenEditFieldConfig } from './greenEdit';
export { allyMakerTypeConfig, allyMakerFieldConfig } from './allyMaker';
export { universalEditTypeConfig, universalEditFieldConfig } from './universalEdit';
export { pureCreateTypeConfig, pureCreateFieldConfig } from './pureCreate';
export { aiEditorTypeConfig, aiEditorFieldConfig } from './aiEditor';

import { greenEditTypeConfig, greenEditFieldConfig } from './greenEdit';
import { allyMakerTypeConfig, allyMakerFieldConfig } from './allyMaker';
import { universalEditTypeConfig, universalEditFieldConfig } from './universalEdit';
import { pureCreateTypeConfig, pureCreateFieldConfig } from './pureCreate';
import { aiEditorTypeConfig, aiEditorFieldConfig } from './aiEditor';
import type { TypeConfig, TemplateFieldConfig } from '../types';

export const kiTypeConfigs: Record<string, TypeConfig> = {
  [greenEditTypeConfig.id]: greenEditTypeConfig,
  [allyMakerTypeConfig.id]: allyMakerTypeConfig,
  [universalEditTypeConfig.id]: universalEditTypeConfig,
  [pureCreateTypeConfig.id]: pureCreateTypeConfig,
  [aiEditorTypeConfig.id]: aiEditorTypeConfig
};

export const kiFieldConfigs: Record<string, TemplateFieldConfig> = {
  [greenEditTypeConfig.id]: greenEditFieldConfig,
  [allyMakerTypeConfig.id]: allyMakerFieldConfig,
  [universalEditTypeConfig.id]: universalEditFieldConfig,
  [pureCreateTypeConfig.id]: pureCreateFieldConfig,
  [aiEditorTypeConfig.id]: aiEditorFieldConfig
};
