import { useState, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { IconType } from 'react-icons';
import './SubsectionTabBar.css';

export interface Subsection {
    id: string;
    icon: IconType;
    label: string;
    content: ReactNode;
}

export interface SubsectionTabBarProps {
    subsections: Subsection[];
    defaultSubsection?: string;
}

/**
 * SubsectionTabBar - A modular component for sections with multiple subsections.
 * On mobile, renders a fixed secondary bar ABOVE the main tab bar using a portal.
 * Content only shows after user clicks a subsection icon.
 * On desktop, shows all subsections stacked.
 */
export function SubsectionTabBar({
    subsections,
    defaultSubsection,
}: SubsectionTabBarProps) {
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' && window.innerWidth < 900
    );

    // On mobile, start with nothing selected. On desktop, select first/default.
    const [activeSubsection, setActiveSubsection] = useState<string | null>(
        isMobile ? null : (defaultSubsection || subsections[0]?.id || null)
    );
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 900);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Create/find portal container for the fixed bar
    useEffect(() => {
        if (!isMobile) {
            setPortalContainer(null);
            return;
        }

        let container = document.getElementById('subsection-bar-portal');
        if (!container) {
            container = document.createElement('div');
            container.id = 'subsection-bar-portal';
            document.body.appendChild(container);
        }
        setPortalContainer(container);

        return () => {
            // Cleanup portal on unmount
            const existing = document.getElementById('subsection-bar-portal');
            if (existing && existing.childNodes.length === 0) {
                existing.remove();
            }
        };
    }, [isMobile]);

    const activeContent = subsections.find((s) => s.id === activeSubsection)?.content;

    // Desktop: show all subsections stacked
    if (!isMobile) {
        return (
            <div className="subsection-stacked">
                {subsections.map((sub) => (
                    <div key={sub.id} className="subsection-stacked__item">
                        {sub.content}
                    </div>
                ))}
            </div>
        );
    }

    // Mobile: render fixed bar via portal + content inline
    const bar = (
        <div className="subsection-bar-fixed">
            {subsections.map((sub) => {
                const Icon = sub.icon;
                const isActive = activeSubsection === sub.id;
                return (
                    <button
                        key={sub.id}
                        type="button"
                        className={`subsection-bar-fixed__tab ${isActive ? 'subsection-bar-fixed__tab--active' : ''}`}
                        onClick={() => setActiveSubsection(
                            activeSubsection === sub.id ? null : sub.id
                        )}
                        aria-label={sub.label}
                    >
                        <Icon size={20} />
                        <span className="subsection-bar-fixed__label">{sub.label}</span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <>
            {/* Fixed bar rendered via portal - above main tab bar */}
            {portalContainer && createPortal(bar, portalContainer)}

            {/* Content area - only shows when a subsection is selected */}
            {activeSubsection && activeContent && (
                <div className="subsection-content-mobile">
                    {activeContent}
                </div>
            )}
        </>
    );
}
