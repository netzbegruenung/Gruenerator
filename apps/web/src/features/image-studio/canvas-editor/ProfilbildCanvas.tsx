/**
 * ProfilbildCanvas Component
 * Interactive canvas for positioning profile picture on green background
 * Uses official react-konva pattern: controlled state, update only in onDragEnd/onTransformEnd
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_BACKGROUND_COLOR,
  INITIAL_SCALE,
  type ProfilbildCanvasProps
} from '@gruenerator/shared/canvas-editor';
import { CanvasEditorLayout } from './layouts';
import { SidebarTabBar } from './sidebar';
import './ProfilbildCanvas.css';

interface ImageState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ProfilbildCanvas({
  transparentImage,
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  canvasSize = DEFAULT_CANVAS_SIZE,
  onExport,
  onCancel,
  onSave
}: ProfilbildCanvasProps & { onSave?: (base64: string) => void }) {
  const stageRef = useRef<Konva.Stage>(null);
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isSelected, setIsSelected] = useState(false);
  const [imageState, setImageState] = useState<ImageState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });

  const displayScale = containerSize.width / canvasSize;

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      const aspectRatio = img.width / img.height;
      let width: number;
      let height: number;

      if (aspectRatio > 1) {
        width = canvasSize * INITIAL_SCALE;
        height = width / aspectRatio;
      } else {
        height = canvasSize * INITIAL_SCALE;
        width = height * aspectRatio;
      }

      setImageState({
        x: (canvasSize - width) / 2,
        y: canvasSize - height,
        width,
        height
      });
    };
    img.src = transparentImage;
  }, [transparentImage, canvasSize]);

  useEffect(() => {
    if (isSelected && trRef.current && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  useEffect(() => {
    const updateSize = () => {
      const maxWidth = Math.min(window.innerWidth - 48, 600);
      const maxHeight = window.innerHeight - 200;
      const size = Math.min(maxWidth, maxHeight);
      setContainerSize({ width: size, height: size });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    setImageState(prev => prev ? {
      ...prev,
      x: e.target.x(),
      y: e.target.y()
    } : null);
  }, []);

  const handleTransformEnd = useCallback(() => {
    const node = imageRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    node.scaleX(1);
    node.scaleY(1);

    setImageState({
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * scaleX),
      height: Math.max(20, node.height() * scaleY)
    });
  }, []);

  const checkDeselect = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) {
      setIsSelected(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    setIsSelected(false);
    setTimeout(() => {
      if (!stageRef.current) return;
      const dataUrl = stageRef.current.toDataURL({
        pixelRatio: 1 / displayScale,
      });
      onExport(dataUrl);
    }, 50);
  }, [displayScale, onExport]);

  const handleSave = useCallback(() => {
    setIsSelected(false);
    setTimeout(() => {
      if (!stageRef.current) return;
      const dataUrl = stageRef.current.toDataURL({
        pixelRatio: 1 / displayScale,
      });
      onSave?.(dataUrl);
    }, 50);
  }, [displayScale, onSave]);

  const tabBar = (
    <SidebarTabBar
      tabs={[]}
      activeTab={null}
      onTabClick={() => { }}
      onExport={handleExport}
      onSave={handleSave}
    />
  );

  if (!image || !imageState) {
    return (
      <div className="profilbild-canvas-loading">
        <div className="loading-spinner" />
        <p>Bild wird geladen...</p>
      </div>
    );
  }

  return (
    <CanvasEditorLayout sidebar={null} tabBar={tabBar} actions={null}>
      <div className="profilbild-canvas-wrapper" style={{ width: containerSize.width, height: containerSize.height }}>
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scale={{ x: displayScale, y: displayScale }}
          onMouseDown={checkDeselect}
          onTouchStart={checkDeselect}
        >
          <Layer>
            <Rect x={0} y={0} width={canvasSize} height={canvasSize} fill={backgroundColor} listening={false} />
            <KonvaImage ref={imageRef} image={image} x={imageState.x} y={imageState.y} width={imageState.width} height={imageState.height} draggable onClick={() => setIsSelected(true)} onTap={() => setIsSelected(true)} onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd} />
            {isSelected && (
              <Transformer
                ref={trRef}
                flipEnabled={false}
                rotateEnabled={false}
                keepRatio={true}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                boundBoxFunc={(oldBox, newBox) => {
                  const minSize = 20;
                  const maxSize = canvasSize * 2;
                  if (newBox.width < minSize || newBox.height < minSize) return oldBox;
                  if (newBox.width > maxSize || newBox.height > maxSize) return oldBox;
                  return newBox;
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </CanvasEditorLayout>
  );
}

export default ProfilbildCanvas;