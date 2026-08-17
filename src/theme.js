export const THEMES = {
  copper: {
    name: 'Copper Warmth',
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
    accent: '#E8935C',
  },
  teal: {
    name: 'Emerald Teal',
    bg: '#0A1211',
    bgElevated: '#121D1C',
    bgElevated2: '#182726',
    line: 'rgba(240,250,248,0.08)',
    text: '#F0FAF8',
    textDim: '#8CA6A2',
    textFaint: '#607875',
    copper: '#4FC8B8',
    copperSoft: 'rgba(79,200,184,0.16)',
    teal: '#4FC8B8',
    rose: '#FF6F91',
    accent: '#4FC8B8',
  },
  rose: {
    name: 'Neon Rose',
    bg: '#140A0E',
    bgElevated: '#1E1218',
    bgElevated2: '#281720',
    line: 'rgba(250,240,245,0.08)',
    text: '#FAF0F5',
    textDim: '#A88E9B',
    textFaint: '#7A626F',
    copper: '#FF6F91',
    copperSoft: 'rgba(255,111,145,0.16)',
    teal: '#4FC8B8',
    rose: '#FF6F91',
    accent: '#FF6F91',
  },
  purple: {
    name: 'Midnight Purple',
    bg: '#0F0C16',
    bgElevated: '#181423',
    bgElevated2: '#211C30',
    line: 'rgba(245,240,255,0.08)',
    text: '#F5F0FF',
    textDim: '#9B92B0',
    textFaint: '#6E6680',
    copper: '#8C6FE8',
    copperSoft: 'rgba(140,111,232,0.16)',
    teal: '#4FC8B8',
    rose: '#FF6F91',
    accent: '#8C6FE8',
  },
  amoled: {
    name: 'AMOLED Pure Black',
    bg: '#000000',
    bgElevated: '#0E0E0E',
    bgElevated2: '#161616',
    line: 'rgba(255,255,255,0.10)',
    text: '#FFFFFF',
    textDim: '#B0B0B0',
    textFaint: '#707070',
    copper: '#E8935C',
    copperSoft: 'rgba(232,147,92,0.18)',
    teal: '#4FC8B8',
    rose: '#FF6F91',
    accent: '#E8935C',
  },
};

let currentThemeKey = 'copper';
export const colors = { ...THEMES.copper };

export function setTheme(key) {
  if (THEMES[key]) {
    currentThemeKey = key;
    Object.assign(colors, THEMES[key]);
  }
  return colors;
}

export function getThemeKey() {
  return currentThemeKey;
}

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
  return gradients[hashStr(id || 'default') % gradients.length];
}

export function hashStr(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
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

export const fonts = {
  display: undefined,
  displayMedium: undefined,
  body: undefined,
  bodyMedium: undefined,
  bodySemibold: undefined,
  mono: undefined,
};
