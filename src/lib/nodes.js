// ─── Node Helpers ─────────────────────────────────────────────

export const uid = () => `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

// Make a fresh node
export const makeNode = (text = "") => ({
  id: uid(), t: text, ch: [], col: false,
  star: false, hl: null, pri: null, tags: [],
  type: null,   // null(note) | "task" | "event" | "reference" | "research" | "idea" | "project" | "recurring"
  done: false,  // completion state (applies to task, recurring)
  sched: null,  // { date: "2026-03-21", time: "09:00", dur: 30 } | null
  note: "",     // freeform note/description
});

export const NODE_TYPES = [
  { id: null,        label: "Note",      icon: "\u2022", color: "#888" },
  { id: "task",      label: "Task",      icon: "\u2610", color: "#03DAC6" },
  { id: "event",     label: "Event",     icon: "\u25F7", color: "#FBBF24" },
  { id: "reference", label: "Reference", icon: "\u25C6", color: "#38BDF8" },
  { id: "research",  label: "Research",  icon: "\u25CE", color: "#F0ABFC" },
  { id: "idea",      label: "Idea",      icon: "\u2726", color: "#FFD740" },
  { id: "project",   label: "Project",   icon: "\u25A3", color: "#69F0AE" },
  { id: "recurring", label: "Recurring", icon: "\u21BB", color: "#EA80FC" },
];

// Highlight colors (cycle order)
export const HIGHLIGHTS = [null, "#69F0AE", "#FFD740", "#EA80FC"];
export const PRIORITIES = [null, "low", "med", "high"];
export const PRI_COLORS = { low: "#03DAC6", med: "#FFD740", high: "#CF6679" };
export const PRI_LABELS = { low: "!", med: "!!", high: "!!!" };

// ─── Storage Keys & User Model ────────────────────────────────

export const STORAGE_KEY = "second-brain-v1";
export const USER_KEY = "second-brain-user";

export const GUEST_USER = {
  id: "guest",
  name: "Guest",
  email: "",
  avatar: null,
  plan: "pro", // "free" | "pro" — everyone is pro during prototype
  provider: null, // "email" | "google" | "apple"
  createdAt: null,
};

export const PLANS = {
  free: {
    label: "Free",
    maxNodes: 100,
    aiChat: false,
    customThemes: false,
    export: false,
  },
  pro: {
    label: "Pro",
    maxNodes: Infinity,
    aiChat: true,
    customThemes: true,
    export: true,
  },
};

// ─── Layout Constants ─────────────────────────────────────────

export const INDENT_PX = 24;
export const BULLET_SIZE = 32;
export const ROW_MIN_H = 44;

// ─── Paste Parsing ────────────────────────────────────────────

// Parse pasted text into a flat array of { text, depth } entries
export function parsePastedLines(raw) {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    // Count leading whitespace (2 spaces = 1 depth level)
    const stripped = line.replace(/^\s*[-\u2022*]\s*/, "").trim();
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    const depth = Math.floor(leadingSpaces / 2);
    return { text: stripped, depth };
  });
}

// Convert flat parsed lines into a tree of nodes
export function buildNodeTree(parsed) {
  if (parsed.length === 0) return [];
  // Normalize depths so first item is depth 0
  const minDepth = Math.min(...parsed.map((p) => p.depth));
  const normalized = parsed.map((p) => ({ ...p, depth: p.depth - minDepth }));

  const roots = [];
  const stack = []; // { node, depth }

  for (const { text, depth } of normalized) {
    const node = makeNode(text);
    // Find parent: walk stack back to find depth - 1
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.ch.push(node);
    }
    stack.push({ node, depth });
  }
  return roots;
}
