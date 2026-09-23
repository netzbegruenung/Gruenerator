import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { lightTheme } from '../../../theme/colors';

import { AnswerModeChip } from './AnswerModeChip';

describe('AnswerModeChip', () => {
  it('names the mode and announces it as one label', () => {
    render(
      <AnswerModeChip
        view={{
          label: 'Präzisionsmodus',
          hint: 'automatisch gewählt',
          accessibilityLabel: 'Beantwortet im Präzisionsmodus, automatisch gewählt',
        }}
        theme={lightTheme}
      />
    );
    expect(screen.getByText('Präzisionsmodus')).toBeTruthy();
    expect(screen.getByText('· automatisch gewählt')).toBeTruthy();
    expect(
      screen.getByLabelText('Beantwortet im Präzisionsmodus, automatisch gewählt')
    ).toBeTruthy();
  });

  it('shows no hint when the person chose the mode', () => {
    render(
      <AnswerModeChip
        view={{ label: 'Chatmodus', hint: null, accessibilityLabel: 'Beantwortet im Chatmodus' }}
        theme={lightTheme}
      />
    );
    expect(screen.getByText('Chatmodus')).toBeTruthy();
    expect(screen.queryByText(/automatisch/)).toBeNull();
  });
});
