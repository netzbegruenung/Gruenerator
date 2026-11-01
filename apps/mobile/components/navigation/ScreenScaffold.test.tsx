import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { ScreenScaffold } from './ScreenScaffold';

jest.mock('./ProfileMenu', () => ({
  ProfileMenu: () => {
    const { View: MockView } = jest.requireActual<{ View: typeof View }>('react-native');
    return <MockView testID="profile-menu" />;
  },
}));
jest.mock('./SidebarMenuButton', () => ({ SidebarMenuButton: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

describe('ScreenScaffold', () => {
  it('shows the profile menu when headerRight is omitted', async () => {
    await render(
      <ScreenScaffold title="T">
        <View />
      </ScreenScaffold>
    );
    expect(screen.getByTestId('profile-menu')).toBeTruthy();
  });

  it('shows nothing when headerRight is null', async () => {
    await render(
      <ScreenScaffold title="T" headerRight={null}>
        <View />
      </ScreenScaffold>
    );
    expect(screen.queryByTestId('profile-menu')).toBeNull();
  });
});
