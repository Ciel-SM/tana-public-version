export interface LiveVoiceOption {
  voiceName: string;
  toneLabel: string;
}

export const LIVE_VOICE_OPTIONS: LiveVoiceOption[] = [
  { voiceName: 'Zephyr', toneLabel: 'Bright' },
  { voiceName: 'Puck', toneLabel: 'Upbeat' },
  { voiceName: 'Charon', toneLabel: 'Informative' },
  { voiceName: 'Kore', toneLabel: 'Firm' },
  { voiceName: 'Fenrir', toneLabel: 'Excitable' },
  { voiceName: 'Leda', toneLabel: 'Youthful' },
  { voiceName: 'Orus', toneLabel: 'Firm' },
  { voiceName: 'Aoede', toneLabel: 'Breezy' },
  { voiceName: 'Callirrhoe', toneLabel: 'Easy-going' },
  { voiceName: 'Autonoe', toneLabel: 'Bright' },
  { voiceName: 'Enceladus', toneLabel: 'Breathy' },
  { voiceName: 'Iapetus', toneLabel: 'Clear' },
  { voiceName: 'Umbriel', toneLabel: 'Easy-going' },
  { voiceName: 'Algieba', toneLabel: 'Smooth' },
  { voiceName: 'Despina', toneLabel: 'Smooth' },
  { voiceName: 'Erinome', toneLabel: 'Clear' },
  { voiceName: 'Algenib', toneLabel: 'Gravelly' },
  { voiceName: 'Rasalgethi', toneLabel: 'Informative' },
  { voiceName: 'Laomedeia', toneLabel: 'Upbeat' },
  { voiceName: 'Achernar', toneLabel: 'Soft' },
  { voiceName: 'Alnilam', toneLabel: 'Firm' },
  { voiceName: 'Schedar', toneLabel: 'Even' },
  { voiceName: 'Gacrux', toneLabel: 'Mature' },
  { voiceName: 'Pulcherrima', toneLabel: 'Forward' },
  { voiceName: 'Achird', toneLabel: 'Friendly' },
  { voiceName: 'Zubenelgenubi', toneLabel: 'Casual' },
  { voiceName: 'Vindemiatrix', toneLabel: 'Gentle' },
  { voiceName: 'Sadachbia', toneLabel: 'Lively' },
  { voiceName: 'Sadaltager', toneLabel: 'Knowledgeable' },
  { voiceName: 'Sulafat', toneLabel: 'Warm' },
];

export const DEFAULT_LIVE_VOICE_NAME = 'Kore';
export const DEFAULT_LIVE_TONE_LABEL = 'Firm';

export const LIVE_TONE_LABELS = Array.from(
  new Set(LIVE_VOICE_OPTIONS.map(option => option.toneLabel))
);

export function normalizeLiveVoiceName(voiceName?: string | null): string {
  if (!voiceName) return DEFAULT_LIVE_VOICE_NAME;
  return LIVE_VOICE_OPTIONS.some(option => option.voiceName === voiceName)
    ? voiceName
    : DEFAULT_LIVE_VOICE_NAME;
}

export function normalizeLiveToneLabel(toneLabel?: string | null): string {
  if (!toneLabel) return DEFAULT_LIVE_TONE_LABEL;
  return LIVE_TONE_LABELS.includes(toneLabel)
    ? toneLabel
    : DEFAULT_LIVE_TONE_LABEL;
}
