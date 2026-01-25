import React from 'react';
import './FloatingTapBar.css';

export interface FloatingTapBarProps {
  visible: boolean;
  children: React.ReactNode;
}

export function FloatingTapBar({ visible, children }: FloatingTapBarProps) {
  if (!visible) return null;

  return (
    <div className="floating-tap-bar-container">
      <div className="floating-tap-bar">{children}</div>
    </div>
  );
}
