// ─── Design Tokens (Purple Rain) ─────────────────────────────

export const T = {
  bg: "#121212",
  surface: "#1E1E2E",
  surfaceAlt: "#252536",
  border: "rgba(255,255,255,0.1)",
  text: "#E0E0E0",
  textDim: "#888",
  textFaint: "#555",
  accent: "#BB86FC",
  teal: "#03DAC6",
  red: "#CF6679",
  radius: 12,
  radiusSm: 8,
  radiusSheet: 28,
  font: "'Manrope', system-ui, -apple-system, sans-serif",
};

// ─── Default Settings ────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  fontFamily: "Manrope",
  fontSize: 17,
  fontWeight: 400,
  lineHeight: 1.6,
  letterSpacing: 0,
  bgColor: "#121212",
  textColor: "#E0E0E0",
  accentColor: "#BB86FC",
  theme: "default",
  apiKey: "",
  aiModel: "claude-sonnet-4-6",
  aiProvider: "anthropic",
};

export const AI_MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4", provider: "anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "anthropic" },
];

export const THEMES = [
  {
    id: "default", label: "Default", emoji: "\uD83C\uDF19",
    fontFamily: "Manrope", fontSize: 17, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0,
    bgColor: "#121212", textColor: "#E0E0E0", accentColor: "#BB86FC",
  },
  {
    id: "coder", label: "Coder", emoji: "\uD83D\uDCBB",
    fontFamily: "Fira Code", fontSize: 15, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0.5,
    bgColor: "#0A0A0A", textColor: "#00FF41", accentColor: "#00FF41",
  },
  {
    id: "writer", label: "Writer", emoji: "\u270D\uFE0F",
    fontFamily: "Georgia", fontSize: 18, fontWeight: 400, lineHeight: 1.8, letterSpacing: 0.25,
    bgColor: "#1C1917", textColor: "#D6D3D1", accentColor: "#FBBF24",
  },
  {
    id: "focus", label: "Focus", emoji: "\uD83C\uDFAF",
    fontFamily: "System", fontSize: 16, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0,
    bgColor: "#000000", textColor: "#FFFFFF", accentColor: "#3B82F6",
  },
  {
    id: "paper", label: "Paper", emoji: "\uD83D\uDCC4",
    fontFamily: "Source Sans", fontSize: 17, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0,
    bgColor: "#1E1E1E", textColor: "#C8C8C8", accentColor: "#E8651A",
  },
  {
    id: "ocean", label: "Ocean", emoji: "\uD83C\uDF0A",
    fontFamily: "Manrope", fontSize: 17, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0,
    bgColor: "#0F172A", textColor: "#CBD5E1", accentColor: "#38BDF8",
  },
  {
    id: "vapor", label: "Vapor", emoji: "\uD83C\uDF38",
    fontFamily: "Manrope", fontSize: 17, fontWeight: 300, lineHeight: 1.7, letterSpacing: 0.5,
    bgColor: "#1A1025", textColor: "#E8D5F5", accentColor: "#F0ABFC",
  },
];

export const FONT_OPTIONS = [
  { label: "Manrope", value: "Manrope" },
  { label: "Poppins", value: "Poppins" },
  { label: "System", value: "system-ui, -apple-system, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Source Sans", value: "'Source Sans 3', system-ui, sans-serif" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "JetBrains", value: "'JetBrains Mono', monospace" },
];

export const BG_OPTIONS = [
  { label: "Default", value: "#121212" },
  { label: "Navy", value: "#1E1E2E" },
  { label: "Black", value: "#000000" },
  { label: "Sepia", value: "#2B2118" },
  { label: "Cream", value: "#FAF8F0" },
  { label: "White", value: "#FFFFFF" },
  { label: "Mint", value: "#F0FAF4" },
  { label: "Sky", value: "#F0F4FA" },
];
