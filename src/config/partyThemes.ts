export const PARTY_TYPES = ['TDP', 'YSRCP', 'JANASENA', 'BJP', 'CONGRESS', 'OTHER'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export interface PartyTheme {
  /** Main brand colour: buttons, links, active states. Must carry white text. */
  primary: string;
  /** Darkest brand colour: sidebar / headers. Must carry white text. */
  dark: string;
  /** Light brand colour used to tint backgrounds. */
  tint: string;
  /** Secondary brand colour for highlights. */
  accent: string;
}

// Colours sampled from each party's flag / logo.
export const PARTY_THEMES: Record<Exclude<PartyType, 'OTHER'>, PartyTheme> = {
  TDP: { primary: '#D9381E', dark: '#2F6B1F', tint: '#FFE600', accent: '#4C8C2B' },
  YSRCP: { primary: '#1F5FBF', dark: '#103A75', tint: '#8FB8F0', accent: '#1F9D4D' },
  JANASENA: { primary: '#C8202B', dark: '#6E0F17', tint: '#F4A3A8', accent: '#2B2B2B' },
  CONGRESS: { primary: '#138808', dark: '#0B5A22', tint: '#FFB35C', accent: '#FF9933' },
  BJP: { primary: '#F26B0C', dark: '#8F3A00', tint: '#FFC58A', accent: '#138808' },
};

export const PARTY_LABELS: Record<Exclude<PartyType, 'OTHER'>, string> = {
  TDP: 'TDP',
  YSRCP: 'YSRCP',
  JANASENA: 'JANASENA',
  CONGRESS: 'CONGRESS',
  BJP: 'BJP',
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function parse(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a: string, b: string, weightOfB: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x: number, y: number) => Math.round(x + (y - x) * weightOfB).toString(16).padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`.toUpperCase();
}

/** Theme for an "Other" party built from the single colour the admin picked. */
export function buildCustomTheme(primary: string): PartyTheme {
  const base = primary.toUpperCase();
  return {
    primary: base,
    dark: mix(base, '#000000', 0.55),
    tint: mix(base, '#FFFFFF', 0.45),
    accent: mix(base, '#000000', 0.25),
  };
}
