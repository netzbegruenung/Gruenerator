import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { openUrl } from '../../services/share';

import { LegalNotice } from './LegalNotice';

jest.mock('../../services/share', () => ({ openUrl: jest.fn() }));

describe('LegalNotice', () => {
  it.each([
    ['Nutzungsbedingungen', 'https://gruenerator.eu/nutzungsbedingungen'],
    ['Datenschutzerklärung', 'https://gruenerator.eu/datenschutz'],
    ['KI-Transparenz', 'https://gruenerator.eu/ki-transparenz'],
  ])('öffnet %s über openUrl', (label, url) => {
    render(<LegalNotice color="#000" />);
    fireEvent.press(screen.getByText(label));
    expect(openUrl).toHaveBeenCalledWith(url);
  });
});
