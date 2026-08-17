import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

registerRootComponent(App);

if (Platform.OS !== 'web') {
  try {
    const TrackPlayer = require('react-native-track-player').default;
    TrackPlayer.registerPlaybackService(() => require('./src/playbackService'));
  } catch (e) {
    // ignore
  }
}
