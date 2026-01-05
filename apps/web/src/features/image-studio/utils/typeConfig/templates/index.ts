/**
 * Template type configurations index
 */
export { dreizeilenTypeConfig, dreizeilenFieldConfig } from './dreizeilen';
export { zitatTypeConfig, zitatFieldConfig } from './zitat';
export { zitatPureTypeConfig, zitatPureFieldConfig } from './zitatPure';
export { infoTypeConfig, infoFieldConfig } from './info';
export { veranstaltungTypeConfig, veranstaltungFieldConfig } from './veranstaltung';
export { profilbildTypeConfig, profilbildFieldConfig } from './profilbild';
export { simpleTypeConfig, simpleFieldConfig } from './simple';

import { dreizeilenTypeConfig, dreizeilenFieldConfig } from './dreizeilen';
import { zitatTypeConfig, zitatFieldConfig } from './zitat';
import { zitatPureTypeConfig, zitatPureFieldConfig } from './zitatPure';
import { infoTypeConfig, infoFieldConfig } from './info';
import { veranstaltungTypeConfig, veranstaltungFieldConfig } from './veranstaltung';
import { profilbildTypeConfig, profilbildFieldConfig } from './profilbild';
import { simpleTypeConfig, simpleFieldConfig } from './simple';
import type { TypeConfig, TemplateFieldConfig } from '../types';

export const templateTypeConfigs: Record<string, TypeConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenTypeConfig,
  [zitatTypeConfig.id]: zitatTypeConfig,
  [zitatPureTypeConfig.id]: zitatPureTypeConfig,
  [infoTypeConfig.id]: infoTypeConfig,
  [veranstaltungTypeConfig.id]: veranstaltungTypeConfig,
  [profilbildTypeConfig.id]: profilbildTypeConfig,
  [simpleTypeConfig.id]: simpleTypeConfig
};

export const templateFieldConfigs: Record<string, TemplateFieldConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenFieldConfig,
  [zitatTypeConfig.id]: zitatFieldConfig,
  [zitatPureTypeConfig.id]: zitatPureFieldConfig,
  [infoTypeConfig.id]: infoFieldConfig,
  [veranstaltungTypeConfig.id]: veranstaltungFieldConfig,
  [profilbildTypeConfig.id]: profilbildFieldConfig,
  [simpleTypeConfig.id]: simpleFieldConfig
};
