import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  it('renders exactly three typing dots', () => {
    const { container } = render(<TypingIndicator />);
    expect(container.querySelectorAll('.typing-dot')).toHaveLength(3);
    expect(container.querySelector('.typing-indicator')).toBeInTheDocument();
  });
});
