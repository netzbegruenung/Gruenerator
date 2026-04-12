/**
 * Localization Service Types
 */

/**
 * Supported locales
 */
export type Locale = 'de-DE' | 'de-AT';

/**
 * Localization keys for text replacement
 */
export type LocalizationKey = 'partyName' | 'partyNameGenitive' | 'partyNameShort';

/**
 * Locale mappings structure
 */
export interface LocaleMappings {
  [locale: string]: {
    partyName: string;
    partyNameGenitive: string;
    partyNameShort: string;
  };
}

/**
 * Minimal request shape needed to extract locale. Both Express `Request` and
 * ts-rest `TypedRequest` are structural supertypes of this.
 *
 * Two subtle rules at play here, both from `exactOptionalPropertyTypes: true`:
 *
 * 1. **Every optional field uses `| undefined` explicitly.** Without it,
 *    `{ user?: X }` is strictly different from `{ user?: X | undefined }`,
 *    and Express.Request (whose `user` is always `User | undefined`) can't
 *    assign to the former.
 *
 * 2. **No index signature on `user`.** Adding `[key: string]: unknown` makes
 *    this type incompatible with concrete strict types like `UserProfile`
 *    that don't have an index signature — structural assignment requires
 *    the target's index signature to be satisfied, and missing index
 *    signatures block the assignment. So we list only the fields we actually
 *    read here, and Express's richer `User` type narrows to this shape
 *    via ordinary structural subtyping.
 */
export interface RequestWithLocale {
  user?: { locale?: string | undefined } | undefined;
  headers?:
    | {
        'x-user-locale'?: string | undefined;
        'accept-language'?: string | undefined;
      }
    | undefined;
}
