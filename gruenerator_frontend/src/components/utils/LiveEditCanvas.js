import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';
import { FONT_SIZES } from '../utils/constants';

const LiveEditCanvas = forwardRef(({ initialImage, editingData, onUpdate }, ref) => {
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  const log = useCallback((message, data = {}) => {
    console.log(`LiveEditCanvas: ${message}`, data);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    setCtx(context);
    log('Canvas context set');
  }, [log]);

  useEffect(() => {
    if (ctx && initialImage) {
      const img = new Image();
      img.onload = () => {
        ctx.canvas.width = img.width;
        ctx.canvas.height = img.height;
        redrawCanvas(img);
        log('Initial image loaded and canvas redrawn', { width: img.width, height: img.height });
      };
      img.onerror = () => log('Error loading initial image');
      img.src = initialImage;
    }
  }, [ctx, initialImage, log]);

  const redrawCanvas = useCallback((backgroundImage) => {
    if (!ctx) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(backgroundImage, 0, 0);

    const { textBlockOffset, balkenOffset, fontSize, text, sunflowerPosition } = editingData;

    // Draw text blocks
    ctx.font = `${FONT_SIZES[fontSize]}px Arial`;
    text.forEach((line, index) => {
      const x = textBlockOffset.x + balkenOffset[index];
      const y = textBlockOffset.y + index * (FONT_SIZES[fontSize] * 1.5);
      
      // Draw balken
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x, y, ctx.measureText(line).width + 20, FONT_SIZES[fontSize] * 1.2);
      
      // Draw text
      ctx.fillStyle = 'white';
      ctx.fillText(line, x + 10, y + FONT_SIZES[fontSize]);
    });

    // Draw sunflower (placeholder)
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(sunflowerPosition.x, sunflowerPosition.y, 20, 0, 2 * Math.PI);
    ctx.fill();

    log('Canvas redrawn', editingData);
  }, [ctx, editingData, log]);

  useEffect(() => {
    if (ctx && initialImage) {
      const img = new Image();
      img.onload = () => redrawCanvas(img);
      img.onerror = () => log('Error loading image for redraw');
      img.src = initialImage;
    }
  }, [ctx, initialImage, redrawCanvas, log]);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isClickOnTextBlock(x, y)) {
      setDragTarget('textBlock');
    } else if (isClickOnSunflower(x, y)) {
      setDragTarget('sunflower');
    } else {
      setDragTarget(null);
    }

    setIsDragging(true);
    setLastPos({ x, y });
    log('Mouse down', { x, y, dragTarget });
  }, [log]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragTarget) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - lastPos.x;
    const dy = y - lastPos.y;

    let updatedData = { ...editingData };

    if (dragTarget === 'textBlock') {
      updatedData.textBlockOffset = {
        x: updatedData.textBlockOffset.x + dx,
        y: updatedData.textBlockOffset.y + dy
      };
    } else if (dragTarget === 'sunflower') {
      updatedData.sunflowerPosition = {
        x: updatedData.sunflowerPosition.x + dx,
        y: updatedData.sunflowerPosition.y + dy
      };
    }

    onUpdate(updatedData);
    setLastPos({ x, y });
    log('Mouse move', { dx, dy, dragTarget });
  }, [isDragging, dragTarget, lastPos, editingData, onUpdate, log]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragTarget(null);
    log('Mouse up');
  }, [log]);

  const isClickOnTextBlock = useCallback((x, y) => {
    if (!ctx) return false;
  
    const { textBlockOffset, text, fontSize } = editingData;
    const lineHeight = FONT_SIZES[fontSize] * 1.5;
    
    const totalHeight = text.length * lineHeight;
    const maxWidth = Math.max(...text.map(line => ctx.measureText(line).width)) + 20;
  
    return (
      x >= textBlockOffset.x &&
      x <= textBlockOffset.x + maxWidth &&
      y >= textBlockOffset.y &&
      y <= textBlockOffset.y + totalHeight
    );
  }, [ctx, editingData]);

  const isClickOnSunflower = (x, y) => {
    const { sunflowerPosition } = editingData;
    const distance = Math.sqrt(
      Math.pow(x - sunflowerPosition.x, 2) + Math.pow(y - sunflowerPosition.y, 2)
    );
    return distance <= 20; // Angenommener Radius der Sonnenblume
  };

  const getLiveEditedImage = useCallback(() => {
    return canvasRef.current.toDataURL('image/png');
  }, []);

  useImperativeHandle(ref, () => ({
    getLiveEditedImage
  }));

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    />
  );
});

LiveEditCanvas.propTypes = {
  initialImage: PropTypes.string.isRequired,
  editingData: PropTypes.shape({
    textBlockOffset: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number
    }),
    balkenOffset: PropTypes.arrayOf(PropTypes.number),
    fontSize: PropTypes.oneOf(Object.keys(FONT_SIZES)),
    text: PropTypes.arrayOf(PropTypes.string),
    sunflowerPosition: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number
    })
  }).isRequired,
  onUpdate: PropTypes.func.isRequired
};
LiveEditCanvas.displayName = 'LiveEditCanvas';
export default LiveEditCanvas;