import { type FlatBackground } from '@gruenerator/shared/profilbild';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { swatchGradient } from './sceneModel';

/** A flat background filling its parent: a colour, a gradient or stripes. */
export function FlatFill({ background }: { background: FlatBackground }) {
  if (background.kind === 'color') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: background.color }]} />;
  }
  const g = swatchGradient(background);
  return (
    <LinearGradient
      colors={g.colors}
      locations={g.locations}
      start={g.start}
      end={g.end}
      style={StyleSheet.absoluteFill}
    />
  );
}
