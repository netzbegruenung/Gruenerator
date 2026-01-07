import { HiLockClosed, HiLockOpen } from 'react-icons/hi';
import './CanvasLockOverlay.css';

export interface CanvasLockOverlayProps {
    isLocked: boolean;
    onToggleLock: () => void;
    label?: string;
    className?: string;
}

export function CanvasLockOverlay({
    isLocked,
    onToggleLock,
    label = 'Hintergrund',
    className = '',
}: CanvasLockOverlayProps) {
    return (
        <div className={`background-lock-overlay ${className}`}>
            <span>{label}</span>
            <button
                type="button"
                className="background-lock-button"
                onClick={onToggleLock}
                title={isLocked ? `${label} fixiert (Click zum Lösen)` : `${label} gelöst (Click zum Fixieren)`}
            >
                {isLocked ? <HiLockClosed size={16} /> : <HiLockOpen size={16} />}
            </button>
        </div>
    );
}
