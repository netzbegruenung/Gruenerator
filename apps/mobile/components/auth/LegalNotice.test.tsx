import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { LegalNotice } from './LegalNotice';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const openBrowserAsync = WebBrowser.openBrowserAsync as unknown as jest.Mock<
  (url: string) => Promise<unknown>
>;

describe('LegalNotice', () => {
  it.each([
    ['Nutzungsbedingungen', 'https://gruenerator.eu/nutzungsbedingungen'],
    ['Datenschutzerklärung', 'https://gruenerator.eu/datenschutz'],
    ['KI-Transparenz', 'https://gruenerator.eu/ki-transparenz'],
  ])('öffnet %s im In-App-Browser', (label, url) => {
    openBrowserAsync.mockResolvedValue({ type: 'opened' });
    render(<LegalNotice color="#000" />);
    fireEvent.press(screen.getByText(label));
    expect(openBrowserAsync).toHaveBeenCalledWith(url);
  });

  it('fängt einen fehlgeschlagenen Aufruf ab (GlitchTip #669)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    openBrowserAsync.mockRejectedValue(new Error('Unable to open URL'));
    render(<LegalNotice color="#000" />);
    fireEvent.press(screen.getByText('Datenschutzerklärung'));
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
