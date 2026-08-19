import TrackPlayer, { Event } from 'react-native-track-player';

// Registered once in index.js. Wires OS-level lock-screen /
// notification / Bluetooth headset transport buttons and headphone disconnect to our player.
module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => global.offsongsOnRemoteNext && global.offsongsOnRemoteNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => global.offsongsOnRemotePrev && global.offsongsOnRemotePrev());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));

  // Automatic Play Next when track ends in background / lockscreen
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (global.offsongsOnPlaybackQueueEnded) {
      global.offsongsOnPlaybackQueueEnded();
    }
  });

  // Auto-Pause when headphones are unplugged / Bluetooth disconnects (AUDIO_BECOMING_NOISY)
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent, ducking }) => {
    if (permanent || paused) {
      // Audio route became noisy or another app requested permanent audio focus -> Pause immediately
      await TrackPlayer.pause();
    } else if (ducking) {
      // Temporary notification / navigation alert -> Lower volume smoothly
      await TrackPlayer.setVolume(0.3);
    } else {
      // Notification finished -> Restore full volume
      await TrackPlayer.setVolume(1.0);
    }
  });
};
