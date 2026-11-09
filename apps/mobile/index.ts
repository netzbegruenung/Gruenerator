// The push task must be defined before anything else: a headless start (FCM
// message while the app is killed) loads only this entry, never a screen.
import './services/push/pushTask';
import 'expo-router/entry';
