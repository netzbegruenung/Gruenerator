import { Redirect } from 'expo-router';
import { route } from '../../types/routes';

export default function IndexScreen() {
  return <Redirect href={route('/start')} />;
}
