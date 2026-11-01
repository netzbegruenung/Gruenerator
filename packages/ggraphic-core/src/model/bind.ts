// SPDX-License-Identifier: MPL-2.0
/**
 * Woher ein Wert eines Elements kommt. Ein Text, der seine Schrift aus der Marke
 * hat, merkt sich die Rolle (`font.body`) und die Familie, die sie damals ergab —
 * so lässt sich später die Rolle tauschen, ohne dass jemand Familiennamen rät.
 * Die Form ist die von ggraphic: `bind: { fontFamily: { ref, value } }`.
 */
import { type FontRole } from '../brand/brandPack.js';

export interface FontFamilyBinding {
  ref: `font.${FontRole}`;
  /** Die Familie, die `ref` beim Setzen ergab; `fontFamily` des Elements trägt sie ebenfalls. */
  value: string;
}

export interface ElementBind {
  fontFamily?: FontFamilyBinding;
}
