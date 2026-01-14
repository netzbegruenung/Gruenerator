import React, { useEffect, useRef } from 'react';
import { FaTrash, FaCopy } from 'react-icons/fa';
import * as Slider from '@radix-ui/react-slider';
import type {
    IllustrationInstance,
    KawaiiMood,
    KawaiiIllustrationType,
    KawaiiInstance,
    SvgDef,
    IllustrationDef,
} from '../../utils/illustrations/types';
import { ILLUSTRATION_COLORS } from '../../utils/illustrations/types';
import { getIllustrationPath } from '../../utils/illustrations/registry';
import { prefetchVisible, onThumbnailHover, onThumbnailLeave } from '../../utils/illustrations/svgCache';
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
    type KawaiiProps,
} from 'react-kawaii';
import './IllustrationenSection.css';

const PREVIEW_COMPONENTS: Record<KawaiiIllustrationType, React.FunctionComponent<KawaiiProps>> = {
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

const MOOD_OPTIONS: { id: KawaiiMood; label: string }[] = [
    { id: 'happy', label: '😊' },
    { id: 'blissful', label: '😌' },
    { id: 'lovestruck', label: '😍' },
    { id: 'shocked', label: '😲' },
    { id: 'sad', label: '😢' },
];

/**
 * Hook to prefetch SVG illustrations when thumbnails become visible
 * Uses Intersection Observer with 500px margin for early prefetching
 */
function useIllustrationPrefetch(illustrations: IllustrationDef[]) {
    const thumbnailRefs = useRef<Map<string, HTMLElement>>(new Map());

    useEffect(() => {
        // Only observe SVG illustrations
        const svgIllustrations = illustrations.filter(ill => ill.source !== 'kawaii') as SvgDef[];
        if (svgIllustrations.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visibleIllustrations = entries
                    .filter(e => e.isIntersecting)
                    .map(e => {
                        const id = e.target.getAttribute('data-ill-id');
                        return svgIllustrations.find(ill => ill.id === id);
                    })
                    .filter((def): def is SvgDef => def !== undefined);

                if (visibleIllustrations.length > 0) {
                    // Batch prefetch visible illustrations
                    prefetchVisible(
                        visibleIllustrations.map(def => ({ id: def.id, def }))
                    );
                }
            },
            {
                root: null, // viewport
                rootMargin: '500px', // Prefetch 500px before visible
                threshold: 0.1, // 10% visible triggers callback
            }
        );

        // Observe all thumbnail elements
        thumbnailRefs.current.forEach(element => {
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, [illustrations]);

    return thumbnailRefs;
}

export interface IllustrationenSectionProps {
    onAddIllustration: (id: string) => void;
    selectedIllustration: IllustrationInstance | null;
    onUpdateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
    onRemoveIllustration: (id: string) => void;
    onDuplicateIllustration?: (id: string) => void;
    isExpanded?: boolean;
    illustrations?: IllustrationDef[];
}

export function IllustrationenSection({
    onAddIllustration,
    selectedIllustration,
    onUpdateIllustration,
    onRemoveIllustration,
    onDuplicateIllustration,
    isExpanded = false,
    illustrations = [],
}: IllustrationenSectionProps) {
    const isKawaiiSelected = selectedIllustration?.source === 'kawaii';
    const kawaiiInstance = isKawaiiSelected ? (selectedIllustration as KawaiiInstance) : null;

    const visibleIllustrations = isExpanded ? illustrations : illustrations.slice(0, 4);

    // Set up Intersection Observer for prefetching
    const thumbnailRefs = useIllustrationPrefetch(visibleIllustrations);

    return (
        <div className="sidebar-section sidebar-section--illustrationen">
            <div className="sidebar-card-grid">
                {visibleIllustrations.map((illDef) => {
                    if (illDef.source === 'kawaii') {
                        const PreviewComponent = PREVIEW_COMPONENTS[illDef.id as KawaiiIllustrationType];
                        if (!PreviewComponent) return null;
                        return (
                            <button
                                key={illDef.id}
                                className="sidebar-selectable-card"
                                onClick={() => onAddIllustration(illDef.id)}
                                title={`${illDef.name} hinzufügen`}
                            >
                                <div className="sidebar-selectable-card__preview illustration-preview">
                                    <PreviewComponent size={40} mood="happy" color="#005437" />
                                </div>
                            </button>
                        );
                    }

                    // SVG
                    const svgDef = illDef as SvgDef;
                    return (
                        <button
                            key={illDef.id}
                            ref={(el) => {
                                if (el) {
                                    thumbnailRefs.current.set(illDef.id, el);
                                } else {
                                    thumbnailRefs.current.delete(illDef.id);
                                }
                            }}
                            data-ill-id={illDef.id}
                            className="sidebar-selectable-card"
                            onClick={() => onAddIllustration(illDef.id)}
                            onMouseEnter={() => onThumbnailHover(svgDef.id, svgDef)}
                            onMouseLeave={() => onThumbnailLeave()}
                            title={`${illDef.name} hinzufügen`}
                        >
                            <div className="sidebar-selectable-card__preview illustration-preview illustration-preview--svg">
                                <img
                                    src={getIllustrationPath(svgDef)}
                                    alt={illDef.name}
                                    loading="lazy"
                                    style={{
                                        filter: illDef.source === 'undraw'
                                            ? 'hue-rotate(-83deg) brightness(0.5) saturate(1.2)'
                                            : illDef.source === 'opendoodles'
                                                ? 'hue-rotate(172deg) brightness(0.5) saturate(1.2)'
                                                : 'none'
                                    }}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Settings Panel */}
            {selectedIllustration && (
                <div className="illustrationen-settings">
                    <div className="sidebar-section-header">
                        <span className="sidebar-section-title">
                            {isKawaiiSelected ? 'Charakter bearbeiten' : 'Illustration bearbeiten'}
                        </span>
                        {onDuplicateIllustration && (
                            <button
                                className="sidebar-action-btn"
                                onClick={() => onDuplicateIllustration(selectedIllustration.id)}
                                title="Duplizieren"
                            >
                                <FaCopy size={12} />
                            </button>
                        )}
                        <button
                            className="sidebar-action-btn sidebar-action-btn--danger"
                            onClick={() => onRemoveIllustration(selectedIllustration.id)}
                            title="Entfernen"
                        >
                            <FaTrash size={12} />
                        </button>
                    </div>

                    {/* Mood selector (only Kawaii) */}
                    {kawaiiInstance && (
                        <div className="illustrationen-mood">
                            <span className="illustrationen-label">Stimmung</span>
                            <div className="illustrationen-mood-grid">
                                {MOOD_OPTIONS.map((mood) => (
                                    <button
                                        key={mood.id}
                                        className={`illustrationen-mood-btn ${kawaiiInstance.mood === mood.id ? 'illustrationen-mood-btn--active' : ''}`}
                                        onClick={() => onUpdateIllustration(kawaiiInstance.id, { mood: mood.id })}
                                        title={mood.id}
                                    >
                                        {mood.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color grid (All) */}
                    {selectedIllustration && (
                        <div className="illustrationen-colors">
                            <span className="illustrationen-label">Farbe</span>
                            <div className="illustrationen-color-grid">
                                {ILLUSTRATION_COLORS.map((color) => (
                                    <button
                                        key={color.id}
                                        className={`illustrationen-color-btn ${selectedIllustration.color === color.color ? 'illustrationen-color-btn--active' : ''}`}
                                        style={{ backgroundColor: color.color }}
                                        onClick={() => onUpdateIllustration(selectedIllustration.id, { color: color.color })}
                                        title={color.label}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Opacity slider (Both) */}
                    <div className="illustrationen-opacity">
                        <span className="illustrationen-label">
                            Transparenz: {Math.round(selectedIllustration.opacity * 100)}%
                        </span>
                        <Slider.Root
                            className="slider-root"
                            value={[selectedIllustration.opacity * 100]}
                            onValueChange={([val]) => onUpdateIllustration(selectedIllustration.id, { opacity: val / 100 })}
                            min={10}
                            max={100}
                            step={5}
                        >
                            <Slider.Track className="slider-track">
                                <Slider.Range className="slider-range" />
                            </Slider.Track>
                            <Slider.Thumb className="slider-thumb" />
                        </Slider.Root>
                    </div>
                </div>
            )}
        </div>
    );
}
