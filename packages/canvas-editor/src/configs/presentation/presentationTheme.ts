/**
 * Presentation Theme — backward-compatible re-export.
 *
 * The actual tokens now live in the dependency-free leaf module
 * `utils/presentationTokens` so both configs and sidebar can import them
 * without forming a cross-chunk module-init cycle. This path is kept so the
 * existing config-side importers (and the package barrel) need no change.
 */

export * from '../../utils/presentationTokens';
