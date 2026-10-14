/**
 * Das `color`-Attribut von Akzent- und Markermark: im Dokument als
 * `attrs.color` (`#RRGGBB` oder `null` = Farbe der Vorlage), im DOM als
 * `data-color` plus CSS-Variable, die `canvas-editor.css` liest.
 */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const colorAttribute = (cssVar: string, extraStyle?: (color: string) => string) => ({
  default: null,
  parseHTML: (element: HTMLElement) => {
    const color = element.getAttribute('data-color');
    return color && HEX_COLOR.test(color) ? color.toUpperCase() : null;
  },
  renderHTML: (attributes: { color?: string | null }) => {
    const color = attributes.color;
    if (!color || !HEX_COLOR.test(color)) return {};
    const style = [`${cssVar}:${color}`, extraStyle?.(color)].filter(Boolean).join(';');
    return { 'data-color': color, style };
  },
});
