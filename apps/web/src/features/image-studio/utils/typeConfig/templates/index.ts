/**
 * Template type configurations index
 */
export { dreizeilenTypeConfig, dreizeilenFieldConfig } from './dreizeilen';
export { zitatTypeConfig, zitatFieldConfig } from './zitat';
export { zitatPureTypeConfig, zitatPureFieldConfig } from './zitatPure';
export { infoTypeConfig, infoFieldConfig } from './info';
export { veranstaltungTypeConfig, veranstaltungFieldConfig } from './veranstaltung';
export {
  veranstaltungPlakatTypeConfig,
  veranstaltungPlakatFieldConfig,
} from './veranstaltungPlakat';
export { profilbildTypeConfig, profilbildFieldConfig } from './profilbild';
export { simpleTypeConfig, simpleFieldConfig } from './simple';
export { sliderTypeConfig, sliderFieldConfig } from './slider';
export { freeformTypeConfig, freeformFieldConfig } from './freeform';
export { presentationTypeConfig, presentationFieldConfig } from './presentation';

import { dreizeilenTypeConfig, dreizeilenFieldConfig } from './dreizeilen';
import { freeformTypeConfig, freeformFieldConfig } from './freeform';
import { infoTypeConfig, infoFieldConfig } from './info';
import { presentationTypeConfig, presentationFieldConfig } from './presentation';
import { profilbildTypeConfig, profilbildFieldConfig } from './profilbild';
import { simpleTypeConfig, simpleFieldConfig } from './simple';
import { sliderTypeConfig, sliderFieldConfig } from './slider';
import { veranstaltungTypeConfig, veranstaltungFieldConfig } from './veranstaltung';
import {
  veranstaltungPlakatTypeConfig,
  veranstaltungPlakatFieldConfig,
} from './veranstaltungPlakat';
import { zitatTypeConfig, zitatFieldConfig } from './zitat';
import { zitatPureTypeConfig, zitatPureFieldConfig } from './zitatPure';

import type { TypeConfig, TemplateFieldConfig } from '../types';

export const templateTypeConfigs: Record<string, TypeConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenTypeConfig,
  [zitatTypeConfig.id]: zitatTypeConfig,
  [zitatPureTypeConfig.id]: zitatPureTypeConfig,
  [infoTypeConfig.id]: infoTypeConfig,
  [veranstaltungTypeConfig.id]: veranstaltungTypeConfig,
  [veranstaltungPlakatTypeConfig.id]: veranstaltungPlakatTypeConfig,
  [profilbildTypeConfig.id]: profilbildTypeConfig,
  [simpleTypeConfig.id]: simpleTypeConfig,
  [sliderTypeConfig.id]: sliderTypeConfig,
  [freeformTypeConfig.id]: freeformTypeConfig,
  [presentationTypeConfig.id]: presentationTypeConfig,
};

export const templateFieldConfigs: Record<string, TemplateFieldConfig> = {
  [dreizeilenTypeConfig.id]: dreizeilenFieldConfig,
  [zitatTypeConfig.id]: zitatFieldConfig,
  [zitatPureTypeConfig.id]: zitatPureFieldConfig,
  [infoTypeConfig.id]: infoFieldConfig,
  [veranstaltungTypeConfig.id]: veranstaltungFieldConfig,
  [veranstaltungPlakatTypeConfig.id]: veranstaltungPlakatFieldConfig,
  [profilbildTypeConfig.id]: profilbildFieldConfig,
  [simpleTypeConfig.id]: simpleFieldConfig,
  [sliderTypeConfig.id]: sliderFieldConfig,
  [freeformTypeConfig.id]: freeformFieldConfig,
  [presentationTypeConfig.id]: presentationFieldConfig,
};
