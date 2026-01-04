import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function FullscreenLayout() {
  return (
    <>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
    </>
  );
}
