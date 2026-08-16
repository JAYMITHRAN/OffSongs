export const colors = {
  bg: '#100C0E',
  bgElevated: '#1A1518',
  bgElevated2: '#221B1F',
  line: 'rgba(245,240,236,0.08)',
  text: '#F5F0EC',
  textDim: '#A79A96',
  textFaint: '#756968',
  copper: '#E8935C',
  copperSoft: 'rgba(232,147,92,0.16)',
  teal: '#4FC8B8',
  rose: '#FF6F91',
};

export const gradients = [
  ['#E8935C', '#7A4B8C'],
  ['#4FC8B8', '#2B4C6F'],
  ['#FF6F91', '#5B3A5E'],
  ['#E8C05C', '#7A4B4B'],
  ['#8C6FE8', '#2E2440'],
  ['#5CD1E8', '#2A4A5C'],
  ['#E85C7A', '#3A2440'],
  ['#8CE85C', '#2E4B2E'],
];

export function gradientFor(id) {
  return gradients[hashStr(id) % gradients.length];
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// NOTE: React Native has no web-safe Google Fonts <link> tag. To get the
// Space Grotesk / Inter / JetBrains Mono look from the web version, install
// `expo-font` + `@expo-google-fonts/space-grotesk` etc. and load them with
// useFonts() in App.js. Left as system fonts here to keep the scaffold
// dependency-light; swap `fontFamily` values below once fonts are loaded.
export const fonts = {
  display: undefined, // e.g. 'SpaceGrotesk_700Bold'
  displayMedium: undefined,
  body: undefined, // e.g. 'Inter_400Regular'
  bodyMedium: undefined,
  bodySemibold: undefined,
  mono: undefined, // e.g. 'JetBrainsMono_400Regular'
};
