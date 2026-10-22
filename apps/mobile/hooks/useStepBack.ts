import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

/** What a back gesture, the header arrow or Android's back button dispatch. */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP']);

/**
 * A screen with steps inside one route: while `active`, every way back — the
 * header arrow, Android's back button, the iOS swipe — goes one step back
 * instead of leaving the screen and its work. Other ways out (a `dismissTo`
 * after saving) still leave.
 */
export function useStepBack(active: boolean, stepBack: () => void): void {
  const navigation = useNavigation();
  usePreventRemove(active, ({ data }) => {
    if (BACK_ACTIONS.has(data.action.type)) stepBack();
    else navigation.dispatch(data.action);
  });
}
