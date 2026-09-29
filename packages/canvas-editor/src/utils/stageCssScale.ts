import type Konva from 'konva';

/**
 * Faktor, um den die Seite per CSS skaliert ist (`--canvas-zoom`, Mobile-Sheet-Fit).
 * Konva rechnet in seinen eigenen Pixeln; wer ein DOM-Element über die Bühne
 * legt, multipliziert Konva-Positionen und -Maßstäbe damit.
 */
export function stageCssScale(stage: Konva.Stage, containerBox: DOMRect): number {
  // Ein nicht vermessener Container (versteckt, jsdom) sagt nichts über den Zoom.
  if (!stage.width() || !containerBox.width) return 1;
  return containerBox.width / stage.width();
}
