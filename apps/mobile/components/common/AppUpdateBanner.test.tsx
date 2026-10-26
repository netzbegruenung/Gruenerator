import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Platform, View as MockView } from 'react-native';

import { AppUpdateBanner } from './AppUpdateBanner';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView },
  FadeInUp: undefined,
  FadeOutUp: undefined,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.6.0' } },
}));

const mockOta = {
  isUpdatePending: false,
  isRestarting: false,
  downloadedUpdate: undefined as { updateId: string } | undefined,
};
const mockUpdates = {
  isEnabled: true,
  useUpdates: () => mockOta,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({})),
  reloadAsync: jest.fn(async () => undefined),
};
// Getters: the component module is imported before these constants exist.
jest.mock('../../services/expoUpdates', () => ({
  get Updates() {
    return mockUpdates;
  },
}));

let onDownloaded: (() => void) | null = null;
const mockPlay = {
  check: jest.fn(async () => ({ available: false, downloaded: false, versionCode: 0 })),
  startFlexibleUpdate: jest.fn(async () => true),
  completeUpdate: jest.fn(async () => undefined),
  simulateUpdateForTesting: jest.fn(async () => undefined),
  addListener: jest.fn((_: string, listener: () => void) => {
    onDownloaded = listener;
    return { remove: jest.fn() };
  }),
};
jest.mock('../../modules/play-in-app-updates', () => ({
  get PlayInAppUpdates() {
    return mockPlay;
  },
}));

const mockIosRelease = jest.fn(async () => ({
  status: 200,
  body: { version: null as string | null },
}));
jest.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ appRelease: { getIosStoreRelease: mockIosRelease } }),
}));

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

beforeEach(async () => {
  jest.clearAllMocks();
  Object.assign(mockOta, {
    isUpdatePending: false,
    isRestarting: false,
    downloadedUpdate: undefined,
  });
  onDownloaded = null;
  await AsyncStorage.clear();
  jest.replaceProperty(Platform, 'OS', 'ios');
});

describe('AppUpdateBanner', () => {
  it('stays hidden when nothing is new', async () => {
    render(<AppUpdateBanner />);
    await waitFor(() => expect(mockIosRelease).toHaveBeenCalled());
    expect(screen.queryByTestId('app-update-banner')).toBeNull();
  });

  it('offers the restart once an OTA update is downloaded', async () => {
    Object.assign(mockOta, { isUpdatePending: true, downloadedUpdate: { updateId: 'u1' } });
    render(<AppUpdateBanner />);
    expect(await screen.findByText('Neue Version geladen')).toBeTruthy();

    fireEvent.press(screen.getByText('Neu starten'));
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  describe('iOS', () => {
    it('sends to the App Store when a newer version is live', async () => {
      mockIosRelease.mockResolvedValueOnce({ status: 200, body: { version: '1.7.0' } });
      render(<AppUpdateBanner />);
      expect(await screen.findByText('Neue Version im App Store')).toBeTruthy();

      fireEvent.press(screen.getByText('Aktualisieren'));
      expect(openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6740809955');
      expect(screen.queryByTestId('app-update-banner')).toBeNull();
    });

    it('ignores a store version that is not newer than the installed one', async () => {
      mockIosRelease.mockResolvedValueOnce({ status: 200, body: { version: '1.6.0' } });
      render(<AppUpdateBanner />);
      await waitFor(() => expect(mockIosRelease).toHaveBeenCalled());
      expect(screen.queryByTestId('app-update-banner')).toBeNull();
    });

    it('does not offer a dismissed store version again after a restart', async () => {
      mockIosRelease.mockResolvedValue({ status: 200, body: { version: '1.7.0' } });
      const first = render(<AppUpdateBanner />);
      fireEvent.press(await screen.findByText('Später'));
      expect(screen.queryByTestId('app-update-banner')).toBeNull();
      await waitFor(async () =>
        expect(await AsyncStorage.getItem('app-update-banner:dismissed-store-version')).toBe(
          '1.7.0'
        )
      );
      first.unmount();

      render(<AppUpdateBanner />);
      await waitFor(() => expect(mockIosRelease).toHaveBeenCalledTimes(2));
      expect(screen.queryByTestId('app-update-banner')).toBeNull();
    });
  });

  describe('Android', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
    });

    it('walks through Play: offer, download, restart', async () => {
      mockPlay.check.mockResolvedValueOnce({ available: true, downloaded: false, versionCode: 42 });
      render(<AppUpdateBanner />);

      fireEvent.press(await screen.findByText('Aktualisieren'));
      expect(mockPlay.startFlexibleUpdate).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('app-update-banner')).toBeNull();

      onDownloaded?.();
      fireEvent.press(await screen.findByText('Neu starten'));
      expect(mockPlay.completeUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    });

    it('offers the restart for a Play update downloaded in an earlier session', async () => {
      mockPlay.check.mockResolvedValueOnce({ available: false, downloaded: true, versionCode: 42 });
      render(<AppUpdateBanner />);
      expect(await screen.findByText('Neue Version geladen')).toBeTruthy();
    });

    it('never asks Apple', async () => {
      render(<AppUpdateBanner />);
      await waitFor(() => expect(mockPlay.check).toHaveBeenCalled());
      expect(mockIosRelease).not.toHaveBeenCalled();
    });
  });
});
