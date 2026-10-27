import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { MarketCard } from './MarketCard';

/**
 * „Zu meinen Grüneratoren" ist ein eigener Knopf neben der Kachel: erreichbar
 * mit eigenem Namen, und ein Tipp darauf öffnet nicht den Chat.
 */
const props = {
  iconKey: 'PiSparkle',
  title: 'Pressemitteilung',
  meta: 'Rezept',
  description: 'Schreibt eine Pressemitteilung.',
};

describe('MarketCard', () => {
  it('offers no toggle for own items', () => {
    render(<MarketCard {...props} onPress={jest.fn()} added={null} onToggleAdded={jest.fn()} />);
    expect(screen.queryByLabelText(/meinen Grüneratoren/)).toBeNull();
  });

  it('adds without opening the card', () => {
    const onPress = jest.fn();
    const onToggleAdded = jest.fn();
    render(<MarketCard {...props} onPress={onPress} added={false} onToggleAdded={onToggleAdded} />);

    fireEvent.press(screen.getByLabelText('Pressemitteilung zu meinen Grüneratoren'));
    expect(onToggleAdded).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('names the removal once the item is added', () => {
    render(<MarketCard {...props} onPress={jest.fn()} added onToggleAdded={jest.fn()} />);
    const toggle = screen.getByLabelText('Pressemitteilung aus meinen Grüneratoren entfernen');
    expect(toggle.props.accessibilityState).toEqual({ selected: true });
  });

  it('opens the actions on a long press and through the VoiceOver action', () => {
    const onLongPress = jest.fn();
    render(<MarketCard {...props} onPress={jest.fn()} onLongPress={onLongPress} />);
    const card = screen.getByLabelText('Pressemitteilung');

    fireEvent(card, 'longPress');
    fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(onLongPress).toHaveBeenCalledTimes(2);
  });
});
