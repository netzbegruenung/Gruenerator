import React, { useState, useEffect, useRef } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';
import { renderToStaticMarkup } from 'react-dom/server';
import Konva from 'konva';
import {
    Planet,
    Cat,
    Ghost,
    IceCream,
    Browser,
    Mug,
    SpeechBubble,
    Backpack,
    CreditCard,
    File,
    Folder,
} from 'react-kawaii';
import type {
    IllustrationInstance,
    KawaiiIllustrationType,
    SvgDef,
    KawaiiInstance
} from '../utils/illustrations/types';
import { getIllustrationPath, findIllustrationById } from '../utils/illustrations/registry';
import { getCachedSVG, getSVG } from '../utils/illustrations/svgCache';

// Map illustration type to component
const ILLUSTRATION_COMPONENTS: Record<KawaiiIllustrationType, React.ComponentType<{ size: number; mood: string; color: string }>> = {
    planet: Planet,
    cat: Cat,
    ghost: Ghost,
    iceCream: IceCream,
    browser: Browser,
    mug: Mug,
    speechBubble: SpeechBubble,
    backpack: Backpack,
    creditCard: CreditCard,
    file: File,
    folder: Folder,
};

export interface IllustrationPrimitiveProps {
    illustration: IllustrationInstance;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onDragEnd: (x: number, y: number) => void;
    onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
    onSnapChange?: (h: boolean, v: boolean) => void;
    onSnapLinesChange?: (lines: unknown[]) => void;
    getSnapTargets?: (id: string) => unknown[];
    stageWidth?: number;
    stageHeight?: number;
    draggable?: boolean;
}

export function IllustrationPrimitive({
    illustration,
    isSelected,
    onSelect,
    onDragEnd,
    onTransformEnd,
    draggable = true,
}: IllustrationPrimitiveProps) {
    const groupRef = useRef<Konva.Group>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    // Load Image (Kawaii or SVG)
    useEffect(() => {
        if (illustration.source === 'kawaii') {
            // Render Kawaii component to SVG string
            const instance = illustration as KawaiiInstance;
            const Component = ILLUSTRATION_COMPONENTS[instance.illustrationId];
            if (!Component) return;

            const size = 200; // Render at high resolution
            const svgString = renderToStaticMarkup(
                <Component
                    size={size}
                    mood={instance.mood}
                    color={instance.color}
                />
            );
            const encoded = encodeURIComponent(svgString);
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;

            const img = new window.Image();
            img.src = dataUrl;
            img.onload = () => setImage(img);
        } else {
            // Load SVG from cache or fetch if not cached
            const loadSvg = async () => {
                const def = await findIllustrationById(illustration.illustrationId);
                if (!def || def.source === 'kawaii') return;

                const svgDef = def as SvgDef;

                // Try cache first (synchronous, instant)
                const cached = getCachedSVG(svgDef.id, illustration.color);
                if (cached) {
                    const img = new window.Image();
                    img.src = cached;
                    img.onload = () => setImage(img);
                    return;
                }

                // Fallback: fetch and cache (async)
                try {
                    const dataUrl = await getSVG(svgDef.id, svgDef, illustration.color);
                    const img = new window.Image();
                    img.src = dataUrl;
                    img.onload = () => setImage(img);
                } catch (err) {
                    console.error('Failed to load SVG:', err);
                    // Final fallback: direct load without color manipulation
                    const path = getIllustrationPath(svgDef);
                    const img = new window.Image();
                    img.src = path;
                    img.onload = () => setImage(img);
                }
            };

            loadSvg();
        }
    }, [
        illustration.source,
        illustration.illustrationId,
        illustration.color, // Depend on color
        // Only Kawaii specific props trigger re-render of SVG
        illustration.source === 'kawaii' ? (illustration as KawaiiInstance).mood : null,
        illustration.source === 'kawaii' ? (illustration as KawaiiInstance).color : null
    ]);

    // Transformer logic
    useEffect(() => {
        if (isSelected && transformerRef.current && groupRef.current) {
            transformerRef.current.nodes([groupRef.current]);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    if (!image) return null;

    const BASE_SIZE = 200;
    const TARGET_SIZE = 100; // Larger default than icons
    const baseScale = TARGET_SIZE / BASE_SIZE;

    return (
        <>
            <Group
                ref={groupRef}
                x={illustration.x}
                y={illustration.y}
                scaleX={illustration.scale * baseScale}
                scaleY={illustration.scale * baseScale}
                rotation={illustration.rotation}
                opacity={illustration.opacity}
                draggable={draggable}
                onClick={(e) => {
                    e.cancelBubble = true;
                    onSelect(illustration.id);
                }}
                onTap={(e) => {
                    e.cancelBubble = true;
                    onSelect(illustration.id);
                }}
                onDragEnd={(e) => {
                    onDragEnd(e.target.x(), e.target.y());
                }}
                onTransformEnd={() => {
                    const node = groupRef.current;
                    if (!node) return;

                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const newScale = Math.max(scaleX, scaleY) / baseScale;
                    const newRotation = node.rotation();

                    // Reset node transform
                    node.scaleX(illustration.scale * baseScale);
                    node.scaleY(illustration.scale * baseScale);
                    node.rotation(illustration.rotation);

                    onTransformEnd(
                        node.x(),
                        node.y(),
                        newScale,
                        newRotation
                    );
                }}
            >
                <Image
                    image={image}
                    width={BASE_SIZE}
                    height={BASE_SIZE}
                    offsetX={BASE_SIZE / 2}
                    offsetY={BASE_SIZE / 2}
                />

                {/* Selection border */}
                {isSelected && (
                    <Rect
                        x={-BASE_SIZE / 2}
                        y={-BASE_SIZE / 2}
                        width={BASE_SIZE}
                        height={BASE_SIZE}
                        stroke="#005437"
                        strokeWidth={2 / (illustration.scale * baseScale)}
                        dash={[5, 5]}
                        listening={false}
                    />
                )}
            </Group>

            {isSelected && (
                <Transformer
                    ref={transformerRef}
                    keepRatio={true}
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    anchorSize={10}
                    anchorCornerRadius={5}
                    borderStroke="#005437"
                    anchorStroke="#005437"
                    anchorFill="#ffffff"
                />
            )}
        </>
    );
}
