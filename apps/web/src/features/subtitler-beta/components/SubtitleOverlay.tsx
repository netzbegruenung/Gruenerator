// Untertitel-Overlay-Komponente - Rendert Untertitel mit Canvas (Referenz: WebAV EmbedSubtitlesClip)
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

import { useChunks } from '../stores/historyStore';

import type { SubtitleStyle } from './SubtitleSettings';

import { cn } from '@/utils/cn';

interface SubtitleOverlayProps {
  currentTime: number;
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  containerDimensions: { width: number; height: number };
  videoDimensions: { width: number; height: number };
  className?: string;
}

export function SubtitleOverlay({
  currentTime,
  style,
  onStyleChange,
  containerDimensions,
  videoDimensions,
  className,
}: SubtitleOverlayProps) {
  const chunks = useChunks();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drag-Zustand
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Canvas-Größenstatus - verwendet die übergebenen Containermaße
  const canvasSize = containerDimensions;
  const [actualVideoDisplaySize, setActualVideoDisplaySize] = useState({ width: 0, height: 0 });

  // Aktuellen Untertitel für die aktuelle Zeit ermitteln - Referenz: WebAV Zeitabgleich-Logik
  const currentSubtitle = useMemo(() => {
    if (!chunks || chunks.length === 0) return null;

    // Untertitel für den aktuellen Zeitabschnitt finden, Referenz: WebAV tick-Methode
    return (
      chunks.find(
        (chunk) =>
          !chunk.deleted &&
          currentTime >= chunk.timestamp[0] &&
          currentTime <= chunk.timestamp[1] &&
          chunk.text &&
          chunk.text.trim() !== ''
      ) || null
    );
  }, [chunks, currentTime]);

  // Skalierungsfaktor und tatsächliche Videoanzeigeabmessungen berechnen
  const { scaleFactor, actualVideoSize } = useMemo(() => {
    if (
      !videoDimensions.width ||
      !videoDimensions.height ||
      !containerDimensions.width ||
      !containerDimensions.height
    ) {
      return { scaleFactor: 1, actualVideoSize: { width: 0, height: 0 } };
    }

    // Tatsächliche Anzeigegröße des Videos im Container berechnen (Seitenverhältnis beibehalten)
    const videoAspectRatio = videoDimensions.width / videoDimensions.height;
    const containerAspectRatio = containerDimensions.width / containerDimensions.height;

    let actualDisplayWidth, actualDisplayHeight;

    if (videoAspectRatio > containerAspectRatio) {
      // Video ist breiter, Breite als Referenz
      actualDisplayWidth = containerDimensions.width;
      actualDisplayHeight = containerDimensions.width / videoAspectRatio;
    } else {
      // Video ist höher, Höhe als Referenz
      actualDisplayHeight = containerDimensions.height;
      actualDisplayWidth = containerDimensions.height * videoAspectRatio;
    }

    // Skalierungsfaktor basierend auf der Höhe berechnen (Untertitelgröße hängt typischerweise von der Videohöhe ab)
    const factor = actualDisplayHeight / videoDimensions.height;

    return {
      scaleFactor: factor,
      actualVideoSize: { width: actualDisplayWidth, height: actualDisplayHeight },
    };
  }, [videoDimensions, containerDimensions]);

  // Status der tatsächlichen Videoanzeigeabmessungen aktualisieren
  useEffect(() => {
    setActualVideoDisplaySize(actualVideoSize);
  }, [actualVideoSize]);

  // Hilfsfunktion zum Skalieren von Größen
  const scaleSize = useCallback(
    (size: number) => {
      return Math.round(size * scaleFactor);
    },
    [scaleFactor]
  );

  // Canvas-Renderfunktion - Referenz: WebAV #renderTxt-Methode
  const renderSubtitleToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSubtitle) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasSize.width;
    const height = canvasSize.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width * dpr, height * dpr);

    // Schriftstil setzen - entspricht WebAV fontFamily, fontSize, fontWeight, fontStyle, mit skalierten Größen
    const scaledFontSize = scaleSize(style.fontSize);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
    ctx.textBaseline = 'bottom';

    // Zeichenabstand setzen - entspricht WebAV letterSpacing, mit skaliertem Wert
    const scaledLetterSpacing = scaleSize(style.letterSpacing);
    if (scaledLetterSpacing !== 0) {
      ctx.letterSpacing = `${scaledLetterSpacing}px`;
    }

    // Mehrzeiligen Text verarbeiten - unterstützt Zeilenumbrüche und automatischen Umbruch basierend auf Videobreite
    const text = currentSubtitle.text;
    let lines = text.split('\n').filter((line) => line.trim() !== '');

    // Automatische Umbruchlogik - basierend auf tatsächlicher Videoanzeigebreite, mit angemessenem Rand
    // Wichtig: Sicherstellen, dass die Schrift vor der Textmessung gesetzt ist
    const videoDisplayWidth = actualVideoDisplaySize.width;
    // 90% der Videobreite als Begrenzung verwenden
    const maxTextWidth = Math.max(videoDisplayWidth * 0.9, width * 0.5); // 90% der Videobreite oder 50% der Canvas-Breite, den größeren Wert nehmen
    const wrappedLines: string[] = [];

    if (maxTextWidth > 100) {
      lines.forEach((line) => {
        const lineMetrics = ctx.measureText(line);

        if (lineMetrics.width <= maxTextWidth) {
          // Kein Umbruch nötig, Originalzeile direkt verwenden
          wrappedLines.push(line);
          return;
        }

        // Umbruch nötig, Umbruchstrategie je nach Texttyp wählen
        const isChineseText = /[\u4e00-\u9fff]/.test(line);

        if (isChineseText) {
          // Chinesischer Text: zeichenweiser Umbruch
          let currentLine = '';

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const testLine = currentLine + char;
            const textMetrics = ctx.measureText(testLine);

            if (textMetrics.width <= maxTextWidth || currentLine === '') {
              currentLine = testLine;
            } else {
              // Aktuelle Zeile ist voll, Ergebnis hinzufügen und neue Zeile beginnen
              if (currentLine.trim()) {
                wrappedLines.push(currentLine.trim());
              }
              currentLine = char;
            }
          }

          if (currentLine.trim()) {
            wrappedLines.push(currentLine.trim());
          }
        } else {
          // Lateinischer Text: an Wortgrenzen umbrechen, Wörter nicht trennen
          const words = line.split(/(\s+)/); // Leerzeichentrenner beibehalten
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine + word;
            const testMetrics = ctx.measureText(testLine);

            if (testMetrics.width <= maxTextWidth || currentLine === '') {
              currentLine = testLine;
            } else {
              // Dieses Wort passt nicht in die aktuelle Zeile
              if (currentLine.trim()) {
                wrappedLines.push(currentLine.trim());
                currentLine = word;
              } else {
                // Einzelnes Wort zu lang, zeichenweises Trennen erzwingen
                let longWord = word.trim();
                while (longWord.length > 0) {
                  let cutIndex = longWord.length;
                  for (let i = 1; i <= longWord.length; i++) {
                    const testSubWord = longWord.substring(0, i);
                    const subMetrics = ctx.measureText(testSubWord);
                    if (subMetrics.width > maxTextWidth) {
                      cutIndex = Math.max(1, i - 1);
                      break;
                    }
                  }
                  wrappedLines.push(longWord.substring(0, cutIndex));
                  longWord = longWord.substring(cutIndex);
                }
                currentLine = '';
              }
            }
          }

          if (currentLine.trim()) {
            wrappedLines.push(currentLine.trim());
          }
        }
      });

      // Umbruch-Ergebnis verwenden
      lines = wrappedLines.length > 0 ? wrappedLines : lines;
    }

    // Textposition berechnen - Untertitel werden am unteren Rand des gesamten Containers positioniert
    // Videoposition im Canvas berechnen (für Textausrichtung und Umbruchgrenzen)
    const videoLeft = (width - actualVideoDisplaySize.width) / 2;
    const videoTop = (height - actualVideoDisplaySize.height) / 2;
    const videoRight = videoLeft + actualVideoDisplaySize.width;

    // Untertitel horizontal zentriert auf Videofläche, vertikal positioniert am Containerboden
    const centerX = videoLeft + actualVideoDisplaySize.width / 2;
    const scaledBottomOffset = scaleSize(style.bottomOffset);
    const bottomY = height - scaledBottomOffset; // Basierend auf der gesamten Containerhöhe, nicht dem Videoboden
    const scaledLineHeight = scaledFontSize * style.lineHeight;

    // Textzeilen von unten nach oben zeichnen
    lines.forEach((line, index) => {
      const y = bottomY - (lines.length - 1 - index) * scaledLineHeight;

      // Texthintergrund zeichnen - entspricht WebAV textBgColor
      if (style.backgroundOpacity > 0) {
        const textMetrics = ctx.measureText(line);
        const textWidth = textMetrics.width;
        const scaledBgPadding = scaleSize(style.backgroundPadding);

        ctx.fillStyle = `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255)
          .toString(16)
          .padStart(2, '0')}`;

        let bgX = centerX - textWidth / 2 - scaledBgPadding;
        if (style.textAlign === 'left') bgX = videoLeft + scaledBgPadding;
        if (style.textAlign === 'right') bgX = videoRight - textWidth - scaledBgPadding;

        // Abgerundeten Rechteck-Hintergrund zeichnen
        ctx.beginPath();
        const scaledBgRadius = scaleSize(style.backgroundRadius);
        ctx.roundRect(
          bgX,
          y - scaledFontSize - scaledBgPadding,
          textWidth + scaledBgPadding * 2,
          scaledLineHeight + scaledBgPadding,
          scaledBgRadius
        );
        ctx.fill();
      }

      // Textschatten setzen - entspricht WebAV textShadow, mit skalierten Werten
      if (style.shadowBlur > 0) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowOffsetX = scaleSize(style.shadowOffsetX);
        ctx.shadowOffsetY = scaleSize(style.shadowOffsetY);
        ctx.shadowBlur = scaleSize(style.shadowBlur);
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
      }

      // X-Koordinate des Textes berechnen, basierend auf der Ausrichtung
      let textX = centerX;
      if (style.textAlign === 'left') {
        textX = videoLeft;
        ctx.textAlign = 'left';
      } else if (style.textAlign === 'right') {
        textX = videoRight;
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }

      // Textumrandung zeichnen - entspricht WebAV strokeStyle, lineWidth, lineCap, lineJoin, mit skalierten Werten
      const scaledBorderWidth = scaleSize(style.borderWidth);
      if (scaledBorderWidth > 0) {
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = scaledBorderWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, textX, y);
      }

      // Textfüllung zeichnen - entspricht WebAV color und fillStyle
      ctx.fillStyle = style.color;
      ctx.fillText(line, textX, y);
    });
  }, [currentSubtitle, style, scaleSize, scaleFactor, actualVideoDisplaySize, canvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    renderSubtitleToCanvas();
  }, [canvasSize, renderSubtitleToCanvas]);

  // Drag-Start verarbeiten
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setDragStartY(e.clientY);
      setDragStartOffset(style.bottomOffset);

      // Drag-Styling hinzufügen
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [style.bottomOffset]
  );

  // Drag-Bewegung verarbeiten
  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaY = dragStartY - e.clientY; // Nach oben ist positiv
      const containerHeight = containerDimensions.height;

      // Neuen unteren Versatz berechnen (unter Berücksichtigung des Skalierungsfaktors)
      let newOffset = dragStartOffset + deltaY / scaleFactor;

      // Drag-Bereich begrenzen (20px bis 80% der Containerhöhe, mit Originalgrößen)
      const minOffset = 20;
      const maxOffset = (containerHeight * 0.8) / scaleFactor;
      newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));

      onStyleChange({ ...style, bottomOffset: newOffset });
    },
    [
      isDragging,
      dragStartY,
      dragStartOffset,
      style,
      onStyleChange,
      scaleFactor,
      containerDimensions,
    ]
  );

  // Drag-Ende verarbeiten
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isDragging]);

  // Globale Drag-Events binden
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);

      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Wenn Untertitel nicht sichtbar sind, leeres Canvas zurückgeben
  if (!style.visible) {
    return null;
  }

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
      {/* Canvas-Untertitelrendering - vollständig basierend auf WebAV EmbedSubtitlesClip-Implementierung */}
      <canvas
        ref={canvasRef}
        className="absolute top-[50%] right-0 pointer-events-auto left-[50%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          cursor: isDragging ? 'ns-resize' : currentSubtitle ? 'ns-resize' : 'default',
          opacity: isDragging ? 0.8 : 1,
          transition: isDragging ? 'none' : 'opacity 0.2s ease',
        }}
        onMouseDown={currentSubtitle ? handleDragStart : undefined}
        title={currentSubtitle ? 'Ziehen, um die Untertitelposition anzupassen' : undefined}
      />

      {/* Drag-Hilfslinie */}
      {isDragging && currentSubtitle && (
        <div
          className="absolute left-0 right-0 border-t border-dashed border-primary/60 pointer-events-none"
          style={{ bottom: `${scaleSize(style.bottomOffset)}px` }}
        />
      )}

      {/* Drag-Hilfsbereich - verbesserte Interaktion */}
      {!isDragging && currentSubtitle && (
        <div
          className="absolute left-1/2 transform -translate-x-1/2 w-20 h-8 opacity-0 hover:opacity-20 bg-primary rounded cursor-ns-resize pointer-events-auto transition-opacity"
          style={{ bottom: `${scaleSize(style.bottomOffset) - 16}px` }}
          onMouseDown={handleDragStart}
          title="Klicken und ziehen, um die Untertitelposition anzupassen"
        />
      )}
    </div>
  );
}
