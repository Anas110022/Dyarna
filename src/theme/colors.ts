// Exact hex values from the Dyarna design spec — do not substitute.
export const colors = {
  pine: '#0B2B21',
  pine2: '#0E3327',
  pine3: '#1B4E39',
  gold: '#C9A85F',
  goldSoft: '#E4D6AC',
  ivory: '#F7F4EC',
  ivory2: '#EFE9D8',
  ink: '#16211B',
  inkSoft: '#5B6960',
  whatsapp: '#2BAA5E',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
