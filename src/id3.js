import * as FileSystem from 'expo-file-system';

// Minimal ID3v2.3 / v2.4 tag reader. Reads only the header + tag bytes
// (not the whole audio file) via expo-file-system's ranged base64 reads,
// so it stays cheap even for large libraries.
//
// Supports: TIT2 (title), TPE1 (artist), TALB (album), TCON (genre), APIC (artwork).
// Falls back silently (returns null) on anything it can't parse — callers
// should fall back to filename-derived metadata, same as the web version.

function base64ToBytes(b64) {
  const binary = globalThis.atob ? globalThis.atob(b64) : fromBase64Polyfill(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// RN's JS engine (Hermes) does not always provide atob/btoa.
function fromBase64Polyfill(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = '';
  b64 = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = chars.indexOf(b64[i]);
    const e2 = chars.indexOf(b64[i + 1]);
    const e3 = chars.indexOf(b64[i + 2]);
    const e4 = chars.indexOf(b64[i + 3]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    str += String.fromCharCode(c1);
    if (e3 !== 64 && e3 !== -1) str += String.fromCharCode(c2);
    if (e4 !== 64 && e4 !== -1) str += String.fromCharCode(c3);
  }
  return str;
}

function bytesToBase64(bytes) {
  if (globalThis.btoa) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return globalThis.btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2];
    out += chars[b1 >> 2];
    out += chars[((b1 & 3) << 4) | ((b2 || 0) >> 4)];
    out += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | ((b3 || 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? chars[b3 & 63] : '=';
  }
  return out;
}

function readSynchsafeInt(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}
function readUInt32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function decodeTextFrame(data) {
  const enc = data[0];
  let bytes = data.slice(1);
  try {
    if (enc === 0) {
      // ISO-8859-1
      return Array.from(bytes).map((b) => String.fromCharCode(b)).join('').replace(/\u0000+$/, '').trim();
    }
    if (enc === 1 || enc === 2) {
      // UTF-16 (with or without BOM)
      let start = 0;
      let little = true;
      if (bytes[0] === 0xff && bytes[1] === 0xfe) { little = true; start = 2; }
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) { little = false; start = 2; }
      let out = '';
      for (let i = start; i + 1 < bytes.length; i += 2) {
        const code = little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
        if (code === 0) break;
        out += String.fromCharCode(code);
      }
      return out.trim();
    }
    // UTF-8
    return Array.from(bytes).map((b) => String.fromCharCode(b)).join('').replace(/\u0000+$/, '').trim();
  } catch (e) {
    return '';
  }
}

function parseAPIC(data) {
  try {
    const enc = data[0];
    let i = 1;
    let mimeEnd = data.indexOf(0, i);
    const mime = Array.from(data.slice(i, mimeEnd)).map((b) => String.fromCharCode(b)).join('');
    i = mimeEnd + 1;
    i += 1; // picture type byte
    // description string, terminated by 0x00 (or 0x0000 for UTF-16) — scan for single 0x00 as a practical simplification
    let descEnd = data.indexOf(0, i);
    if (descEnd === -1) descEnd = i;
    i = descEnd + 1;
    const imageBytes = data.slice(i);
    return { mime: mime || 'image/jpeg', base64: bytesToBase64(imageBytes) };
  } catch (e) {
    return null;
  }
}

export async function parseID3Tags(fileUri) {
  try {
    // Read header (first 10 bytes) to find tag size.
    const headerB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 10,
    });
    const header = base64ToBytes(headerB64);
    if (String.fromCharCode(header[0], header[1], header[2]) !== 'ID3') {
      return null; // no ID3v2 tag — caller falls back to filename parsing
    }
    const tagSize = readSynchsafeInt(header, 6);
    if (tagSize <= 0 || tagSize > 8 * 1024 * 1024) return null; // sanity cap at 8MB

    const bodyB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 10,
      length: tagSize,
    });
    const body = base64ToBytes(bodyB64);

    const result = { title: null, artist: null, album: null, genre: null, artwork: null };
    let offset = 0;
    while (offset < body.length - 10) {
      const frameId = String.fromCharCode(body[offset], body[offset + 1], body[offset + 2], body[offset + 3]);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding / end of frames
      const frameSize = readUInt32(body, offset + 4);
      if (frameSize <= 0 || offset + 10 + frameSize > body.length) break;
      const frameData = body.slice(offset + 10, offset + 10 + frameSize);

      if (frameId === 'TIT2') result.title = decodeTextFrame(frameData);
      else if (frameId === 'TPE1') result.artist = decodeTextFrame(frameData);
      else if (frameId === 'TALB') result.album = decodeTextFrame(frameData);
      else if (frameId === 'TCON') result.genre = decodeTextFrame(frameData).replace(/^\(\d+\)/, '');
      else if (frameId === 'APIC' && !result.artwork) result.artwork = parseAPIC(frameData);

      offset += 10 + frameSize;
    }
    return result;
  } catch (e) {
    return null;
  }
}
