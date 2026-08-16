import TrackPlayer, { Event } from 'react-native-track-player';

// Registered once in index.js (see App entry). Wires OS-level lock-screen /
// notification / Bluetooth headset transport buttons to our player.
module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => global.offsongsOnRemoteNext && global.offsongsOnRemoteNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => global.offsongsOnRemotePrev && global.offsongsOnRemotePrev());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
  TrackPlayer.addEventListener(Event.RemoteDuck, ({ paused }) => {
    if (paused) TrackPlayer.pause(); else TrackPlayer.play();
  });
};
