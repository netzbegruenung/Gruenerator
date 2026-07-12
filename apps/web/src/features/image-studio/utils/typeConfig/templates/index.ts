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
export { sliderTypeConfig, sliderFieldConfig } from './slider';
export { freeformTypeConfig, freeformFieldConfig } from './freeform';

import {
  infoAtTypeConfig,
  zitatAtTypeConfig,
  zitatPureAtTypeConfig,
  dreizeilenAtTypeConfig,
  freeformAtTypeConfig,
  infoAtFieldConfig,
  zitatAtFieldConfig,
  zitatPureAtFieldConfig,
  dreizeilenAtFieldConfig,
  freeformAtFieldConfig,
} from './at';
import { dreizeilenTypeConfig, dreizeilenFieldConfig } from './dreizeilen';
import { freeformTypeConfig, freeformFieldConfig } from './freeform';
import { infoTypeConfig, infoFieldConfig } from './info';
import { profilbildTypeConfig, profilbildFieldConfig } from './profilbild';
import { simpleTypeConfig, simpleFieldConfig } from './simple';
import { sliderTypeConfig, sliderFieldConfig } from './slider';
import { veranstaltungTypeConfig, veranstaltungFieldConfig } from './veranstaltung';
import { zitatTypeConfig, zitatFieldConfig } from './zitat';
import { zitatPureTypeConfig, zitatPureFieldConfig } from './zitatPure';

import type { TypeConfig, TemplateFieldConfig } from '../types';

export const templateTypeConfigs: Record<string, TypeConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenTypeConfig,
  [zitatTypeConfig.id]: zitatTypeConfig,
  [zitatPureTypeConfig.id]: zitatPureTypeConfig,
  [infoTypeConfig.id]: infoTypeConfig,
  [veranstaltungTypeConfig.id]: veranstaltungTypeConfig,
  [profilbildTypeConfig.id]: profilbildTypeConfig,
  [simpleTypeConfig.id]: simpleTypeConfig,
  [sliderTypeConfig.id]: sliderTypeConfig,
  [freeformTypeConfig.id]: freeformTypeConfig,
  // Österreich (de-AT)
  [infoAtTypeConfig.id]: infoAtTypeConfig,
  [zitatAtTypeConfig.id]: zitatAtTypeConfig,
  [zitatPureAtTypeConfig.id]: zitatPureAtTypeConfig,
  [dreizeilenAtTypeConfig.id]: dreizeilenAtTypeConfig,
  [freeformAtTypeConfig.id]: freeformAtTypeConfig,
};

export const templateFieldConfigs: Record<string, TemplateFieldConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenFieldConfig,
  [zitatTypeConfig.id]: zitatFieldConfig,
  [zitatPureTypeConfig.id]: zitatPureFieldConfig,
  [infoTypeConfig.id]: infoFieldConfig,
  [veranstaltungTypeConfig.id]: veranstaltungFieldConfig,
  [profilbildTypeConfig.id]: profilbildFieldConfig,
  [simpleTypeConfig.id]: simpleFieldConfig,
  [sliderTypeConfig.id]: sliderFieldConfig,
  [freeformTypeConfig.id]: freeformFieldConfig,
  // Österreich (de-AT)
  [infoAtTypeConfig.id]: infoAtFieldConfig,
  [zitatAtTypeConfig.id]: zitatAtFieldConfig,
  [zitatPureAtTypeConfig.id]: zitatPureAtFieldConfig,
  [dreizeilenAtTypeConfig.id]: dreizeilenAtFieldConfig,
  [freeformAtTypeConfig.id]: freeformAtFieldConfig,
};
