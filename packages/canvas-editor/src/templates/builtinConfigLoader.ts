/**
 * The `config-loader` subpath: the config loader with the built-in catalogue
 * registered. A host that warms a template's chunk before the editor mounts
 * (apps/web's canvas query) imports this instead of the package entry, which
 * would pull the whole editor; importing the catalogue here registers the
 * built-in templates before the first lookup.
 */
export { isValidCanvasType } from './registry';
export { loadCanvasConfig, preloadCanvasTemplate } from '@ggraphic/editor/configs/configLoader';
