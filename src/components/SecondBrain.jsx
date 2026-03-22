import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { T, DEFAULT_SETTINGS, AI_MODELS, THEMES, FONT_OPTIONS, BG_OPTIONS } from '../lib/tokens';
import { uid, makeNode, NODE_TYPES, HIGHLIGHTS, PRIORITIES, PRI_COLORS, PRI_LABELS, STORAGE_KEY, USER_KEY, GUEST_USER, PLANS, parsePastedLines, buildNodeTree, INDENT_PX, BULLET_SIZE, ROW_MIN_H } from '../lib/nodes';
import { findInTree, getNode, removeFromTree, insertAfterInTree, insertAsChild, insertBeforeInTree, updateText, toggleCollapse, updateNodeProp, flattenVisible, flattenAll, matchesFilter, getPrevVisible, getNextVisible, buildBreadcrumbs, getZoomedNodes, collectIds } from '../lib/tree';
import { nodesToText, nodesToTextAll, toPlainText, toMarkdown, toJSON, toOPML } from '../lib/converters';
import db from '../lib/db';
import auth, { loadUserSettings, saveUserSettings, loadCustomThemes, saveCustomTheme, deleteCustomTheme } from '../lib/auth';
import ChatView from './ChatView';
import TimelineView from './TimelineView';
import BoardColumn from './BoardColumn';
import MarkdownNode from './MarkdownView';
import FilterChip from './FilterChip';
import SwipeBtn from './SwipeBtn';
import ToolbarButton from './ToolbarButton';
import SettingRow from './SettingRow';
import Stepper from './Stepper';

export default function SecondBrain() {
  // ─── State ───────────────────────────────────────────────
  const [nodes, setNodes] = useState(() => {
    // Seed data — replaced by saved data on load
    const inbox = {
      id: uid(), t: "Inbox", ch: [
        { id: uid(), t: "Hypnosis script from Claude — need to turn into audio", ch: [], col: false },
        { id: uid(), t: "Look into Replit deployment for Second Brain standalone", ch: [], col: false },
        { id: uid(), t: "That article about solo operators vs teams", ch: [], col: false },
        { id: uid(), t: "New pizza dough hydration experiment — 72% vs 68%", ch: [], col: false },
      ], col: false
    };
    const projects = {
      id: uid(), t: "Projects", ch: [
        { id: uid(), t: "Second Brain", ch: [
          { id: uid(), t: "Layer 1 — outliner mechanics", ch: [
            { id: uid(), t: "Typing, bullets, indent/outdent", ch: [], col: false },
            { id: uid(), t: "Zoom, collapse, breadcrumbs", ch: [], col: false },
            { id: uid(), t: "Drag and drop reorder", ch: [], col: false },
            { id: uid(), t: "Multi-select, copy, delete", ch: [], col: false },
          ], col: false },
          { id: uid(), t: "Layer 2 — documents & workspace", ch: [], col: false },
          { id: uid(), t: "Layer 3 — AI drawer", ch: [], col: false },
          { id: uid(), t: "Layer 4 — intelligence", ch: [], col: false },
        ], col: false },
        { id: uid(), t: "Gridiron — Phase 4 in Claude Code", ch: [], col: false },
        { id: uid(), t: "ForeverPal — landing page story-first direction", ch: [], col: false },
        { id: uid(), t: "XPRIZE — fire throughline, Aug 15 deadline", ch: [], col: false },
      ], col: false
    };
    const thinking = {
      id: uid(), t: "Thinking", ch: [
        { id: uid(), t: "The Stall — when you stop generating lift but still look powerful", ch: [], col: false },
        { id: uid(), t: "Human Moat — desire, direction, conviction, domain mastery", ch: [], col: false },
        { id: uid(), t: "One person operating like a studio — that's the pitch", ch: [], col: false },
      ], col: false
    };
    return [inbox, projects, thinking];
  });
  const [tabs, setTabs] = useState([{ id: "tab-0", label: "🧠", zoomStack: [], viewFormat: "outline" }]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // Derive zoomStack from active tab — all existing zoom code just works
  const zoomStack = tabs[activeTabIdx]?.zoomStack || [];
  const setZoomStack = useCallback((updater) => {
    setTabs((prev) => prev.map((tab, i) =>
      i === activeTabIdx
        ? { ...tab, zoomStack: typeof updater === "function" ? updater(tab.zoomStack) : updater }
        : tab
    ));
  }, [activeTabIdx]);
  const [activeId, setActiveId] = useState(null);
  const [editText, setEditText] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dragState, setDragState] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [swipedId, setSwipedId] = useState(null);
  const [tagSheet, setTagSheet] = useState(null);
  const [editSheet, setEditSheet] = useState(null); // nodeId or null
  const [tagInput, setTagInput] = useState("");
  const swipeRef = useRef({ startX: 0, startY: 0, id: null, swiping: false }); // { id, zone: 'before'|'child'|'after' }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("theme"); // "theme" | "account"
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ star: false, pri: null, hl: null, tag: null, type: null, done: null });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatQueue, setChatQueue] = useState([]); // array of node IDs queued for AI chat
  const [chatMessages, setChatMessages] = useState([]); // { role: "user"|"assistant", content: string }
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  // viewFormat is per-tab — derived like zoomStack
  const viewFormat = tabs[activeTabIdx]?.viewFormat || "outline";
  const setViewFormat = useCallback((updater) => {
    setTabs((prev) => prev.map((tab, i) =>
      i === activeTabIdx
        ? { ...tab, viewFormat: typeof updater === "function" ? updater(tab.viewFormat || "outline") : updater }
        : tab
    ));
  }, [activeTabIdx]);
  const [formatMenu, setFormatMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [renamingTabIdx, setRenamingTabIdx] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [customThemes, setCustomThemes] = useState([]);
  const [saveThemeSheet, setSaveThemeSheet] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeEmoji, setNewThemeEmoji] = useState("🎨");
  const toolbarTimer = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [user, setUser] = useState(GUEST_USER);
  const [authSheet, setAuthSheet] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });

  // ─── Refs ────────────────────────────────────────────────
  const scrollRef = useRef(null);
  const inputRefs = useRef({});
  const blurTimer = useRef(null);
  const saveTimer = useRef(null);
  const dragStartTimer = useRef(null);
  const selectStartTimer = useRef(null);
  const rowRefs = useRef({});
  const dragCleanup = useRef(null);
  const pointerStartPos = useRef(null);
  const toastTimer = useRef(null);
  const pendingFocusId = useRef(null);

  // ─── Computed ────────────────────────────────────────────
  const visibleRootNodes = useMemo(
    () => getZoomedNodes(nodes, zoomStack),
    [nodes, zoomStack]
  );
  const flatList = useMemo(() => {
    const isFiltering = searchOpen && (searchQuery || filters.star || filters.pri || filters.hl || filters.tag || filters.todo || filters.type);
    if (!isFiltering) return flattenVisible(visibleRootNodes);
    // Search across ALL nodes (ignoring collapse) in the zoomed view
    const all = flattenAll(visibleRootNodes);
    return all.filter(({ node }) => matchesFilter(node, searchQuery, filters));
  }, [visibleRootNodes, searchOpen, searchQuery, filters]);

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(nodes, zoomStack),
    [nodes, zoomStack]
  );

  // Collect all unique tags for filter chips
  const allTags = useMemo(() => {
    const tags = new Set();
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.tags) n.tags.forEach((t) => tags.add(t));
        walk(n.ch);
      }
    };
    walk(nodes);
    return [...tags].sort();
  }, [nodes]);

  // Clean stale refs when nodes are removed
  useEffect(() => {
    const validIds = new Set(flatList.map((f) => f.node.id));
    for (const id in inputRefs.current) {
      if (!validIds.has(id)) delete inputRefs.current[id];
    }
    for (const id in rowRefs.current) {
      if (!validIds.has(id)) delete rowRefs.current[id];
    }
  }, [flatList]);

  // ─── Font style from settings ────────────────────────────
  const fontOpt = FONT_OPTIONS.find((f) => f.label === settings.fontFamily) || FONT_OPTIONS[0];
  const textStyle = {
    fontFamily: fontOpt.value,
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
  };

  // ─── Toast ───────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
  }, []);

  // ─── Auth ───────────────────────────────────────────────
  // Hydrate user data from Supabase after sign-in
  const hydrateUser = useCallback(async (appUser) => {
    setUser(appUser);
    setAuthSheet(false);
    setAuthForm({ email: "", password: "", name: "" });
    // Migrate localStorage data if this is their first sign-in
    await db.migrateLocalToSupabase(STORAGE_KEY);
    // Load their data from Supabase
    const data = await db.load(STORAGE_KEY);
    if (data) {
      if (data.nodes?.length) setNodes(data.nodes);
      if (data.tabs?.length) {
        setTabs(data.tabs);
        setActiveTabIdx(data.activeTabIdx || 0);
      }
    }
    // Load settings from user_settings table
    const userSettings = await loadUserSettings(appUser.id);
    if (userSettings) setSettings(prev => ({ ...prev, ...userSettings }));
    // Load custom themes from custom_themes table
    const themes = await loadCustomThemes(appUser.id);
    if (themes.length) setCustomThemes(themes);
  }, []);

  // Auth action wrappers (call imported auth, then update component state)
  const authActions = useMemo(() => ({
    signIn: async ({ email, password }) => {
      const { user: appUser, error } = await auth.signIn({ email, password });
      if (error) { showToast(error); return { user: null, error }; }
      if (appUser) await hydrateUser(appUser);
      return { user: appUser, error: null };
    },
    signUp: async ({ email, password, name }) => {
      const { user: appUser, error } = await auth.signUp({ email, password, name });
      if (error) { showToast(error); return { user: null, error }; }
      if (appUser) await hydrateUser(appUser);
      return { user: appUser, error: null };
    },
    signInWithProvider: async (provider) => {
      const { error } = await auth.signInWithProvider(provider);
      if (error) { showToast(error); return { user: null, error }; }
      // OAuth redirects — onAuthStateChange handles the return
      return { user: null, error: null };
    },
    signOut: async () => {
      await auth.signOut();
      setUser(GUEST_USER);
      setAuthSheet(false);
      // Reload guest data from localStorage
      const data = await db.load(STORAGE_KEY);
      if (data) {
        if (data.nodes?.length) setNodes(data.nodes);
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
      }
    },
    updateProfile: async (updates) => {
      setUser(prev => ({ ...prev, ...updates }));
      if (user.id !== "guest") {
        await auth.updateProfile(user.id, updates);
      }
    },
  }), [hydrateUser, showToast, user.id]);

  const isLoggedIn = user.id !== "guest";

  // ─── Persistence ─────────────────────────────────────────
  // Load on mount — check Supabase session first, fall back to localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Check for existing Supabase session
      const sessionUser = await auth.getSession();
      if (sessionUser && mounted) {
        await hydrateUser(sessionUser);
        setLoaded(true);
        return;
      }
      // No session — load from localStorage (guest mode)
      const data = await db.load(STORAGE_KEY);
      if (data && mounted) {
        if (data.nodes?.length) setNodes(data.nodes);
        if (data.tabs?.length) {
          setTabs(data.tabs);
          setActiveTabIdx(data.activeTabIdx || 0);
        } else if (data.zoomStack) {
          setTabs([{ id: "tab-0", label: "\uD83E\uDDE0", zoomStack: data.zoomStack }]);
        }
        if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
        if (data.customThemes?.length) setCustomThemes(data.customThemes);
      }
      if (mounted) setLoaded(true);
    })();
    // Listen for auth state changes (OAuth redirect returns here)
    const unsubscribe = auth.onAuthStateChange((appUser, event) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' && appUser.id !== 'guest') {
        hydrateUser(appUser);
      } else if (event === 'SIGNED_OUT') {
        setUser(GUEST_USER);
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, [hydrateUser]);

  // ─── Derived state (before effects) ──────────────────────
  const isDragging = dragState !== null;
  const isEditing = activeId !== null && !selectMode;

  // Toolbar delays open for editing (iOS keyboard needs time), instant for select mode
  useEffect(() => {
    clearTimeout(toolbarTimer.current);
    if (selectMode) {
      setToolbarOpen(true); // Instant — no keyboard to wait for
    } else if (isEditing) {
      toolbarTimer.current = setTimeout(() => setToolbarOpen(true), 300);
    } else {
      setToolbarOpen(false);
    }
    return () => clearTimeout(toolbarTimer.current);
  }, [isEditing, selectMode]);
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (user.id !== "guest") {
        // Authenticated: save document data to Supabase, settings/themes to their own tables
        db.save(STORAGE_KEY, { nodes, tabs, activeTabIdx });
        saveUserSettings(user.id, settings);
      } else {
        // Guest: save everything to localStorage
        db.save(STORAGE_KEY, { nodes, tabs, activeTabIdx, settings, customThemes });
      }
    }, 500);
  }, [nodes, tabs, activeTabIdx, settings, customThemes, loaded, user.id]);

  // ─── Tree Mutation Helpers ───────────────────────────────

  const commitEdit = useCallback(
    (id, text) => {
      setNodes((prev) => updateText(prev, id || activeId, text));
    },
    [activeId]
  );

  const activateNode = useCallback(
    (id) => {
      clearTimeout(blurTimer.current);
      if (selectMode) return;
      const node = getNode(nodes, id);
      if (node) {
        setActiveId(id);
        setEditText(node.t);
        const el = inputRefs.current[id];
        if (el) {
          // Prevent iOS from scrolling the whole page
          el.focus({ preventScroll: true });
          setTimeout(() => {
            if (typeof el.setSelectionRange === "function") {
              el.setSelectionRange(el.value.length, el.value.length);
            }
            // Scroll within our container only
            if (scrollRef.current) {
              const sr = scrollRef.current.getBoundingClientRect();
              const er = el.getBoundingClientRect();
              if (er.top < sr.top + 10) {
                scrollRef.current.scrollTop -= (sr.top + 10 - er.top);
              } else if (er.bottom > sr.bottom - 10) {
                scrollRef.current.scrollTop += (er.bottom - sr.bottom + 10);
              }
            }
          }, 0);
        }
      }
    },
    [nodes, selectMode]
  );

  const handleBlur = useCallback(
    (id) => {
      commitEdit(id, editText);
      blurTimer.current = setTimeout(() => {
        setActiveId(null);
      }, 150);
    },
    [editText, commitEdit]
  );

  // Enter: if node has visible children, create first child; otherwise create sibling below
  const handleEnter = useCallback(() => {
    if (!activeId) return;
    clearTimeout(blurTimer.current);
    commitEdit(activeId, editText);
    const newNode = makeNode("");
    pendingFocusId.current = newNode.id;
    setNodes((prev) => {
      const found = findInTree(prev, activeId);
      if (found && found.node.ch.length > 0 && !found.node.col) {
        // Has visible children — insert as first child
        return prev.map(function walk(n) {
          if (n.id === activeId) return { ...n, ch: [newNode, ...n.ch] };
          return { ...n, ch: n.ch.map(walk) };
        });
      }
      // No children or collapsed — insert as sibling after
      return insertAfterInTree(prev, activeId, newNode);
    });
    setActiveId(newNode.id);
    setEditText("");
  }, [activeId, editText, commitEdit]);

  // Backspace on empty: delete current, move to previous
  const handleBackspace = useCallback(() => {
    if (!activeId || editText !== "") return false;
    const prevNode = getPrevVisible(flatList, activeId);
    const found = findInTree(nodes, activeId);
    // Don't delete if it's the only node at root level
    if (!prevNode && found && found.siblings.length <= 1 && !found.parent) return false;
    // Don't delete if it has children
    if (found && found.node.ch.length > 0) return false;

    setNodes((prev) => removeFromTree(prev, activeId).tree);
    if (prevNode) {
      setActiveId(prevNode.id);
      setEditText(prevNode.t);
      // Focus directly — input exists in DOM
      const el = inputRefs.current[prevNode.id];
      if (el) {
        el.focus({ preventScroll: true });
        setTimeout(() => el.setSelectionRange?.(el.value.length, el.value.length), 0);
      }
    } else {
      setActiveId(null);
    }
    return true;
  }, [activeId, editText, flatList, nodes]);

  // Indent: make current node a child of its previous sibling
  const doIndent = useCallback(() => {
    if (!activeId) return;
    commitEdit(activeId, editText);
    setNodes((prev) => {
      const found = findInTree(prev, activeId);
      if (!found || found.index === 0) return prev; // No previous sibling
      const prevSibling = found.siblings[found.index - 1];
      const { tree, removed } = removeFromTree(prev, activeId);
      if (!removed) return prev;
      return insertAsChild(tree, prevSibling.id, removed);
    });
  }, [activeId, editText, commitEdit]);

  // Outdent: move current node to be a sibling after its parent
  const doOutdent = useCallback(() => {
    if (!activeId) return;
    commitEdit(activeId, editText);
    setNodes((prev) => {
      const found = findInTree(prev, activeId);
      if (!found || !found.parent) return prev; // Already at root
      const { tree, removed } = removeFromTree(prev, activeId);
      if (!removed) return prev;
      return insertAfterInTree(tree, found.parent.id, removed);
    });
  }, [activeId, editText, commitEdit]);

  // Zoom into a node
  const doZoom = useCallback(
    (id) => {
      if (activeId) commitEdit(activeId, editText);
      const node = getNode(nodes, id);
      if (node && node.ch.length === 0) {
        const emptyChild = makeNode("");
        pendingFocusId.current = emptyChild.id;
        setNodes((prev) => insertAsChild(prev, id, emptyChild));
        setActiveId(emptyChild.id);
        setEditText("");
      } else if (node && node.ch.length > 0) {
        pendingFocusId.current = node.ch[0].id;
        setActiveId(node.ch[0].id);
        setEditText(node.ch[0].t);
      } else {
        setActiveId(null);
      }
      setZoomStack((prev) => [...prev, id]);
    },
    [activeId, editText, commitEdit, nodes]
  );

  // Zoom to breadcrumb
  const doZoomTo = useCallback(
    (crumbId) => {
      if (activeId) commitEdit(activeId, editText);
      let newStack;
      if (crumbId === "__root__") {
        newStack = [];
      } else {
        const idx = zoomStack.indexOf(crumbId);
        newStack = idx >= 0 ? zoomStack.slice(0, idx + 1) : zoomStack;
      }
      setZoomStack(newStack);
      setActiveId(null);
    },
    [zoomStack, activeId, editText, commitEdit, setZoomStack]
  );

  // ─── TAB MANAGEMENT ────────────────────────────────────────
  const openInNewTab = useCallback((nodeId) => {
    if (activeId) {
      commitEdit(activeId, editText);
      setActiveId(null);
    }
    const node = getNode(nodes, nodeId);
    const label = node?.t?.slice(0, 20) || "Untitled";
    const newTab = { id: `tab-${Date.now()}`, label, zoomStack: [nodeId], viewFormat: "outline" };
    setTabs((prev) => {
      const next = [...prev, newTab];
      // Schedule tab switch after state updates
      setTimeout(() => setActiveTabIdx(next.length - 1), 0);
      return next;
    });
    setSwipedId(null);
    showToast(`Opened "${label}" in new tab`);
  }, [nodes, activeId, editText, commitEdit, showToast]);

  const closeTab = useCallback((idx) => {
    if (tabs.length <= 1) return; // Can't close the last tab
    setTabs((prev) => prev.filter((_, i) => i !== idx));
    setActiveTabIdx((prev) => {
      if (idx < prev) return prev - 1;
      if (idx === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, [tabs.length]);

  const switchTab = useCallback((idx) => {
    if (idx === activeTabIdx) return;
    if (activeId) {
      commitEdit(activeId, editText);
      setActiveId(null);
    }
    setActiveTabIdx(idx);
  }, [activeTabIdx, activeId, editText, commitEdit]);

  // Update active tab label when zoom changes (unless manually renamed)
  useEffect(() => {
    const tab = tabs[activeTabIdx];
    if (!tab || tab.customLabel) return;
    const lastZoomId = zoomStack[zoomStack.length - 1];
    const label = lastZoomId ? (getNode(nodes, lastZoomId)?.t?.slice(0, 20) || "Untitled") : "🧠";
    setTabs((prev) => prev.map((t, i) =>
      i === activeTabIdx ? { ...t, label } : t
    ));
  }, [zoomStack, nodes, activeTabIdx]);

  // ─── PANEL ACTIONS ──────────────────────────────────────────
  const copyPanel = useCallback(() => {
    const text = toPlainText(visibleRootNodes);
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 1200);
    showToast("Copied to clipboard");
  }, [visibleRootNodes, showToast]);

  const exportPanel = useCallback((format) => {
    const title = tabs[activeTabIdx]?.label || "second-brain";
    const safeName = title.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
    let content, ext, mime;

    if (format === "markdown") {
      content = `# ${title}\n\n` + toMarkdown(visibleRootNodes);
      ext = "md"; mime = "text/markdown";
    } else if (format === "json") {
      content = toJSON(visibleRootNodes);
      ext = "json"; mime = "application/json";
    } else if (format === "opml") {
      content = toOPML(visibleRootNodes, title);
      ext = "opml"; mime = "text/xml";
    } else {
      content = toPlainText(visibleRootNodes);
      ext = "txt"; mime = "text/plain";
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${safeName}.${ext}`; a.click();
    URL.revokeObjectURL(url);
    setExportMenu(false);
    showToast(`Exported as .${ext}`);
  }, [visibleRootNodes, tabs, activeTabIdx, showToast]);

  // Toggle collapse
  const doToggle = useCallback(
    (id) => {
      // If collapsing and the active node is a descendant, move focus to this node
      const node = getNode(nodes, id);
      if (node && !node.col && activeId) {
        // About to collapse — check if activeId is inside
        const descendantIds = new Set(collectIds(node));
        if (descendantIds.has(activeId) && activeId !== id) {
          commitEdit(activeId, editText);
          setActiveId(id);
          setEditText(node.t);
          // Focus the parent's input
          setTimeout(() => {
            const el = inputRefs.current[id];
            if (el) el.focus({ preventScroll: true });
          }, 0);
        }
      }
      setNodes((prev) => toggleCollapse(prev, id));
    },
    [nodes, activeId, editText, commitEdit]
  );

  // Arrow up: move to previous visible node
  const handleArrowUp = useCallback(() => {
    if (!activeId) return;
    commitEdit(activeId, editText);
    const prev = getPrevVisible(flatList, activeId);
    if (prev) {
      setActiveId(prev.id);
      setEditText(prev.t);
      const el = inputRefs.current[prev.id];
      if (el) el.focus({ preventScroll: true });
    }
  }, [activeId, editText, flatList, commitEdit]);

  // Arrow down: move to next visible node
  const handleArrowDown = useCallback(() => {
    if (!activeId) return;
    commitEdit(activeId, editText);
    const next = getNextVisible(flatList, activeId);
    if (next) {
      setActiveId(next.id);
      setEditText(next.t);
      const el = inputRefs.current[next.id];
      if (el) el.focus({ preventScroll: true });
    }
  }, [activeId, editText, flatList, commitEdit]);

  // ─── Paste Handler ──────────────────────────────────────
  const handlePaste = useCallback(
    (e) => {
      if (!activeId) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text || !text.includes("\n")) return; // Single line — let native paste work

      e.preventDefault();
      const parsed = parsePastedLines(text);
      if (parsed.length === 0) return;

      // First line merges with current node's text
      const firstLineText = (editText || "") + parsed[0].text;
      commitEdit(activeId, firstLineText);
      setEditText(firstLineText);

      if (parsed.length === 1) return; // Only one line, we're done

      // Remaining lines become new nodes
      const remaining = parsed.slice(1);
      // If all remaining are deeper than the first, they become children
      // Otherwise build a tree and insert as siblings after current node
      const newNodes = buildNodeTree(remaining);

      setNodes((prev) => {
        let tree = prev;
        // Insert each root node after the current node in sequence
        let afterId = activeId;
        for (const newNode of newNodes) {
          tree = insertAfterInTree(tree, afterId, newNode);
          afterId = newNode.id;
        }
        return tree;
      });
    },
    [activeId, editText, commitEdit]
  );

  // ─── Key Handler ─────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Backspace" && editText === "") {
        if (handleBackspace()) e.preventDefault();
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        doIndent();
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        doOutdent();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handleArrowUp();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleArrowDown();
      }
    },
    [handleBackspace, doIndent, doOutdent, handleArrowUp, handleArrowDown, editText]
  );

  // ─── DRAG & DROP ─────────────────────────────────────────

  const startDrag = useCallback(
    (id, startY) => {
      if (selectMode) return;
      // Commit any active edit
      if (activeId) {
        commitEdit(activeId, editText);
        setActiveId(null);
      }

      const node = getNode(nodes, id);
      if (!node) return;

      // Cache descendant IDs once at drag start (instead of per frame)
      const excludeIds = new Set(collectIds(node));

      setDragState({ id, startY, currentY: startY });

      // Nuclear protocol: lock the page
      const style = document.createElement("style");
      style.id = "drag-lock";
      style.textContent = `
        html, body { touch-action: none !important; overflow: hidden !important;
          overscroll-behavior: none !important; user-select: none !important;
          -webkit-user-select: none !important; }
        * { user-select: none !important; -webkit-user-select: none !important; }
      `;
      document.head.appendChild(style);
      window.getSelection()?.removeAllRanges();

      const onMove = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        setDragState((prev) => (prev ? { ...prev, currentY: y } : null));

        // Calculate drop target from pointer position
        let bestTarget = null;
        let bestDist = Infinity;
        for (const item of flatList) {
          if (item.node.id === id) continue;
          if (excludeIds.has(item.node.id)) continue;

          const el = rowRefs.current[item.node.id];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const relY = y - rect.top;
          const pct = relY / rect.height;

          const dist = Math.abs(y - (rect.top + rect.height / 2));
          if (dist < bestDist) {
            bestDist = dist;
            if (pct < 0.3) {
              bestTarget = { id: item.node.id, zone: "before" };
            } else if (pct > 0.7) {
              bestTarget = { id: item.node.id, zone: "after" };
            } else {
              bestTarget = { id: item.node.id, zone: "child" };
            }
          }
        }
        setDropTarget(bestTarget);

        // Auto-scroll
        if (scrollRef.current) {
          const sr = scrollRef.current.getBoundingClientRect();
          const edgeZone = 50;
          if (y < sr.top + edgeZone) {
            scrollRef.current.scrollTop -= 6;
          } else if (y > sr.bottom - edgeZone) {
            scrollRef.current.scrollTop += 6;
          }
        }
      };

      const onEnd = () => {
        // Clean up
        const lockStyle = document.getElementById("drag-lock");
        if (lockStyle) lockStyle.remove();
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);

        // Execute drop
        setDragState(null);
        setDropTarget((currentTarget) => {
          if (currentTarget) {
            setNodes((prev) => {
              const { tree, removed } = removeFromTree(prev, id);
              if (!removed) return prev;
              if (currentTarget.zone === "child") {
                return insertAsChild(tree, currentTarget.id, removed);
              } else if (currentTarget.zone === "before") {
                return insertBeforeInTree(tree, currentTarget.id, removed);
              } else {
                return insertAfterInTree(tree, currentTarget.id, removed);
              }
            });
          }
          return null;
        });
      };

      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);

      dragCleanup.current = onEnd;
    },
    [nodes, flatList, activeId, editText, commitEdit, selectMode]
  );

  // Bullet pointer events — clean state machine
  const bulletDragActive = useRef(false);

  const handleBulletTap = useCallback(
    (id) => {
      const node = getNode(nodes, id);
      if (node?.type === "task" || node?.type === "recurring") {
        setNodes((prev) => updateNodeProp(prev, id, "done", !node.done));
      } else {
        doZoom(id);
      }
    },
    [nodes, doZoom]
  );

  const handleBulletPointerDown = useCallback(
    (e, id) => {
      if (selectMode) return;
      e.preventDefault();
      e.stopPropagation();
      window.getSelection()?.removeAllRanges();
      const y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const x = e.clientX || 0;
      pointerStartPos.current = { x, y, id, ts: Date.now() };
      bulletDragActive.current = false;

      dragStartTimer.current = setTimeout(() => {
        bulletDragActive.current = true;
        startDrag(id, y);
      }, 300);
    },
    [selectMode, startDrag]
  );

  const handleBulletPointerMove = useCallback((e) => {
    if (!pointerStartPos.current || bulletDragActive.current) return;
    const dx = Math.abs(e.clientX - pointerStartPos.current.x);
    const dy = Math.abs(e.clientY - pointerStartPos.current.y);
    if (dx > 8 || dy > 8) {
      clearTimeout(dragStartTimer.current);
      bulletDragActive.current = true;
      startDrag(pointerStartPos.current.id, pointerStartPos.current.y);
    }
  }, [startDrag]);

  const handleBulletPointerUp = useCallback(
    (e, id) => {
      clearTimeout(dragStartTimer.current);
      // If drag was active, the drag's own onEnd handles cleanup
      // Only zoom if this was a quick tap (no drag)
      if (!bulletDragActive.current && !dragState) {
        handleBulletTap(id);
      }
      bulletDragActive.current = false;
      pointerStartPos.current = null;
    },
    [dragState, handleBulletTap]
  );

  // ─── MULTI-SELECT ────────────────────────────────────────

  const handleTextLongPress = useCallback(
    (id) => {
      if (dragState) return;
      // Kill iOS native selection immediately
      window.getSelection()?.removeAllRanges();

      // Save scroll position before any blur/keyboard dismiss
      const savedScroll = scrollRef.current?.scrollTop;

      if (activeId) {
        commitEdit(activeId, editText);
        setActiveId(null);
      }
      // Blur any focused textarea to dismiss keyboard
      if (document.activeElement?.tagName === "TEXTAREA") {
        document.activeElement.blur();
      }
      setSelectMode(true);
      setSelectedIds(new Set([id]));

      // Restore scroll position after iOS viewport readjusts
      const restore = () => {
        if (scrollRef.current && savedScroll != null) {
          scrollRef.current.scrollTop = savedScroll;
        }
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 100);
      setTimeout(restore, 350);
    },
    [dragState, activeId, editText, commitEdit]
  );

  const toggleSelect = useCallback(
    (id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    []
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Nuclear iOS selection suppression during select mode
  useEffect(() => {
    if (!selectMode) return;

    // Inject style to override ALL text selection
    const style = document.createElement("style");
    style.id = "select-lock";
    style.textContent = `
      * { -webkit-user-select: none !important; user-select: none !important;
          -webkit-touch-callout: none !important; }
    `;
    document.head.appendChild(style);

    const suppressCtx = (e) => e.preventDefault();
    document.addEventListener("contextmenu", suppressCtx, { capture: true });

    return () => {
      const el = document.getElementById("select-lock");
      if (el) el.remove();
      document.removeEventListener("contextmenu", suppressCtx, { capture: true });
    };
  }, [selectMode]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setNodes((prev) => {
      let tree = prev;
      for (const id of selectedIds) {
        const result = removeFromTree(tree, id);
        tree = result.tree;
      }
      return tree;
    });
    showToast(`Deleted ${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""}`);
    exitSelectMode();
  }, [selectedIds, exitSelectMode, showToast]);

  const copySelected = useCallback(() => {
    const text = nodesToText(nodes, selectedIds);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    showToast(`Copied ${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""}`);
    exitSelectMode();
  }, [nodes, selectedIds, exitSelectMode, showToast]);

  // ─── Text Pointer Events ─────────────────────────────────
  const textPointerState = useRef(null);

  const handleTextPointerDown = useCallback(
    (e, id) => {
      if (dragState) return;

      // In select mode, just toggle
      if (selectMode) {
        e.preventDefault();
        toggleSelect(id);
        return;
      }

      // Already editing this node — let native behavior work
      if (activeId === id) return;

      // Prevent iOS native text selection on long-press
      // (we handle long-press ourselves for multi-select)
      e.preventDefault();

      const y = e.clientY;
      const x = e.clientX;
      textPointerState.current = { id, x, y, fired: false };

      selectStartTimer.current = setTimeout(() => {
        if (textPointerState.current && textPointerState.current.id === id) {
          textPointerState.current.fired = true;
          handleTextLongPress(id);
        }
      }, 500);
    },
    [dragState, selectMode, activeId, toggleSelect, handleTextLongPress]
  );

  const handleTextPointerUp = useCallback(
    (e, id) => {
      clearTimeout(selectStartTimer.current);
      if (selectMode) return;
      if (textPointerState.current && !textPointerState.current.fired) {
        // Short tap — activate editing
        activateNode(id);
      }
      textPointerState.current = null;
    },
    [selectMode, activateNode]
  );

  const handleTextPointerMove = useCallback((e) => {
    if (!textPointerState.current) return;
    const dx = Math.abs(e.clientX - textPointerState.current.x);
    const dy = Math.abs(e.clientY - textPointerState.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(selectStartTimer.current);
      textPointerState.current = null;
    }
  }, []);

  // ─── SWIPE TO REVEAL ──────────────────────────────────────
  const handleSwipeStart = useCallback((e, id) => {
    if (selectMode || dragState) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    swipeRef.current = { startX: touch.clientX, startY: touch.clientY, id, swiping: false };
  }, [selectMode, dragState]);

  const handleSwipeMove = useCallback((e, id) => {
    const sw = swipeRef.current;
    if (!sw || sw.id !== id) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const dx = touch.clientX - sw.startX;
    const dy = Math.abs(touch.clientY - sw.startY);

    // If vertical movement dominates, it's a scroll — bail
    if (!sw.swiping && dy > 10) {
      swipeRef.current = { startX: 0, startY: 0, id: null, swiping: false };
      return;
    }

    // Left swipe threshold
    if (dx < -30 && dy < 20) {
      sw.swiping = true;
      setSwipedId(id);
    }
  }, []);

  const handleSwipeEnd = useCallback(() => {
    swipeRef.current = { startX: 0, startY: 0, id: null, swiping: false };
  }, []);

  const handleSwipeStar = useCallback((id) => {
    const node = getNode(nodes, id);
    setNodes((prev) => updateNodeProp(prev, id, "star", !node?.star));
    setSwipedId(null);
    showToast(node?.star ? "Unstarred" : "Starred");
  }, [nodes, showToast]);

  const handleSwipeTask = useCallback((id) => {
    const node = getNode(nodes, id);
    const isTask = node?.type === "task";
    setNodes((prev) => {
      let tree = updateNodeProp(prev, id, "type", isTask ? null : "task");
      if (isTask) tree = updateNodeProp(tree, id, "done", false);
      return tree;
    });
    setSwipedId(null);
    showToast(isTask ? "Reverted to note" : "Marked as task");
  }, [nodes, showToast]);

  const handleSwipeHighlight = useCallback((id) => {
    const node = getNode(nodes, id);
    const idx = HIGHLIGHTS.indexOf(node?.hl || null);
    const next = HIGHLIGHTS[(idx + 1) % HIGHLIGHTS.length];
    setNodes((prev) => updateNodeProp(prev, id, "hl", next));
    setSwipedId(null);
    showToast(next ? "Highlighted" : "Highlight removed");
  }, [nodes, showToast]);

  const handleSwipePriority = useCallback((id) => {
    const node = getNode(nodes, id);
    const idx = PRIORITIES.indexOf(node?.pri || null);
    const next = PRIORITIES[(idx + 1) % PRIORITIES.length];
    setNodes((prev) => updateNodeProp(prev, id, "pri", next));
    setSwipedId(null);
    showToast(next ? `Priority: ${next}` : "Priority removed");
  }, [nodes, showToast]);

  const handleSwipeTag = useCallback((id) => {
    const node = getNode(nodes, id);
    setTagSheet({ nodeId: id, tags: node?.tags || [] });
    setTagInput("");
    setSwipedId(null);
  }, [nodes]);

  const addTag = useCallback(() => {
    if (!tagSheet || !tagInput.trim()) return;
    const tag = tagInput.trim().replace(/^#/, "");
    if (!tag) return;
    const current = tagSheet.tags || [];
    if (current.includes(tag)) return;
    const updated = [...current, tag];
    setNodes((prev) => updateNodeProp(prev, tagSheet.nodeId, "tags", updated));
    setTagSheet((prev) => ({ ...prev, tags: updated }));
    setTagInput("");
  }, [tagSheet, tagInput]);

  const removeTag = useCallback((tag) => {
    if (!tagSheet) return;
    const updated = (tagSheet.tags || []).filter((t) => t !== tag);
    setNodes((prev) => updateNodeProp(prev, tagSheet.nodeId, "tags", updated));
    setTagSheet((prev) => ({ ...prev, tags: updated }));
  }, [tagSheet]);

  const handleSwipeDelete = useCallback((id) => {
    if (activeId === id) {
      commitEdit(activeId, editText);
      setActiveId(null);
    }
    setNodes((prev) => removeFromTree(prev, id).tree);
    setSwipedId(null);
    showToast("Deleted");
  }, [activeId, editText, commitEdit, showToast]);

  // Close swipe when tapping elsewhere or changing modes
  useEffect(() => {
    if (!swipedId) return;
    const close = (e) => {
      if (e.target.closest?.("[data-swipe-action]")) return;
      setSwipedId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [swipedId]);

  useEffect(() => {
    if (activeId || selectMode) setSwipedId(null);
  }, [activeId, selectMode]);

  // ─── Search / Filter ──────────────────────────────────────
  const clearSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setFilters({ star: false, pri: null, hl: null, tag: null, type: null, done: null });
  }, []);

  const toggleFilter = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  }, []);

  const isFilterActive = searchQuery || filters.star || filters.pri || filters.hl || filters.tag || filters.todo || filters.type;

  // ─── Settings ────────────────────────────────────────────
  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value, theme: "custom" }));
  }, []);

  const applyTheme = useCallback((themeId) => {
    const theme = THEMES.find((t) => t.id === themeId) || customThemes.find((t) => t.id === themeId);
    if (!theme) return;
    setSettings({
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      fontWeight: theme.fontWeight,
      lineHeight: theme.lineHeight,
      letterSpacing: theme.letterSpacing,
      bgColor: theme.bgColor,
      textColor: theme.textColor,
      accentColor: theme.accentColor,
      theme: theme.id,
    });
  }, [customThemes]);

  const handleSaveCustomTheme = useCallback(async () => {
    if (!newThemeName.trim()) return;
    const themeData = {
      id: `custom-${Date.now()}`,
      label: newThemeName.trim(),
      emoji: newThemeEmoji || "\uD83C\uDFA8",
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      fontWeight: settings.fontWeight,
      lineHeight: settings.lineHeight,
      letterSpacing: settings.letterSpacing,
      bgColor: settings.bgColor,
      textColor: settings.textColor,
      accentColor: settings.accentColor,
    };
    if (user.id !== "guest") {
      const saved = await saveCustomTheme(user.id, themeData);
      if (saved) {
        setCustomThemes((prev) => [...prev, saved]);
        setSettings((prev) => ({ ...prev, theme: saved.id }));
      }
    } else {
      setCustomThemes((prev) => [...prev, themeData]);
      setSettings((prev) => ({ ...prev, theme: themeData.id }));
    }
    setSaveThemeSheet(false);
    setNewThemeName("");
    setNewThemeEmoji("\uD83C\uDFA8");
    showToast(`Theme "${themeData.label}" saved`);
  }, [newThemeName, newThemeEmoji, settings, showToast, user.id]);

  const handleDeleteCustomTheme = useCallback(async (themeId) => {
    setCustomThemes((prev) => prev.filter((t) => t.id !== themeId));
    if (user.id !== "guest") {
      await deleteCustomTheme(user.id, themeId);
    }
    if (settings.theme === themeId) {
      setSettings((prev) => ({ ...prev, theme: "custom" }));
    }
    showToast("Theme deleted");
  }, [settings.theme, showToast, user.id]);

  // ─── Cleanup drag listeners on unmount ──────────────────
  useEffect(() => {
    return () => {
      if (dragCleanup.current) dragCleanup.current();
    };
  }, []);

  // ─── Ensure tree is never empty ──────────────────────────
  useEffect(() => {
    const vis = getZoomedNodes(nodes, zoomStack);
    if (vis.length === 0 && loaded) {
      // Zoomed into a node that has no children — add one
      const zoomId = zoomStack[zoomStack.length - 1];
      if (zoomId) {
        const newNode = makeNode("");
        pendingFocusId.current = newNode.id;
        setNodes((prev) => insertAsChild(prev, zoomId, newNode));
        setActiveId(newNode.id);
        setEditText("");
      }
    }
  }, [nodes, zoomStack, loaded]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: settings.bgColor,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font,
        color: settings.textColor,
        overflow: "hidden",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Google Fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&family=Fira+Code:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* ═══ HEADER ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${T.border}`,
          background: settings.bgColor,
          zIndex: 10,
          minHeight: 48,
          flexShrink: 0,
        }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            borderRadius: T.radiusSm,
            cursor: "pointer",
            color: T.textDim,
            flexShrink: 0,
            marginRight: 4,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Back button — shows when zoomed in */}
        {zoomStack.length > 0 && (
          <button
            onClick={() => {
              if (activeId) { commitEdit(activeId, editText); setActiveId(null); }
              setZoomStack((prev) => prev.slice(0, -1));
            }}
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${T.border}`,
              borderRadius: 18,
              cursor: "pointer",
              color: T.textDim,
              flexShrink: 0,
              marginRight: 4,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Breadcrumbs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flex: 1,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              {i > 0 && (
                <span style={{ color: T.textFaint, fontSize: 12, flexShrink: 0 }}>›</span>
              )}
              <button
                onClick={() => doZoomTo(crumb.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: i === breadcrumbs.length - 1 ? T.text : T.textDim,
                  fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                  fontSize: i === 0 ? 20 : i === breadcrumbs.length - 1 ? 14 : 12,
                  fontFamily: T.font,
                  cursor: "pointer",
                  padding: i === 0 ? "2px 4px" : "4px 2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: i === 0 ? "none" : i === breadcrumbs.length - 1 ? 160 : 80,
                  flexShrink: i === 0 ? 0 : 1,
                  lineHeight: 1,
                }}
              >
                {crumb.label || "Untitled"}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <button
          onClick={() => searchOpen ? clearSearch() : setSearchOpen(true)}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: searchOpen ? "rgba(3,218,198,0.12)" : "none",
            border: "none",
            borderRadius: T.radiusSm,
            cursor: "pointer",
            color: searchOpen ? T.teal : T.textDim,
            flexShrink: 0,
            transition: "all 0.15s",
            position: "relative",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {isFilterActive && (
            <div style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: T.teal }} />
          )}
        </button>

        {/* Auth / User */}
        <button
          onClick={() => isLoggedIn ? setAuthSheet(true) : setAuthSheet(true)}
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isLoggedIn ? settings.accentColor : "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 16,
            cursor: "pointer",
            color: isLoggedIn ? settings.bgColor : T.textDim,
            flexShrink: 0,
            fontSize: isLoggedIn ? 12 : 14,
            fontWeight: 700,
            fontFamily: T.font,
          }}
        >
          {isLoggedIn ? user.name.charAt(0).toUpperCase() : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: showSettings ? "rgba(187,134,252,0.12)" : "none",
            border: "none",
            borderRadius: T.radiusSm,
            cursor: "pointer",
            color: showSettings ? T.accent : T.textDim,
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* ═══ TAB BAR — hides when editing to save screen space ═══ */}
      <div
        style={{
          overflow: (formatMenu || exportMenu) ? "visible" : "hidden",
          maxHeight: toolbarOpen ? 0 : 44,
          transition: "max-height 0.2s ease-out",
          flexShrink: 0,
        }}
      >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          overflowX: (formatMenu || exportMenu) ? "visible" : "auto",
          flexShrink: 0,
          minHeight: 40,
          borderBottom: `1px solid ${T.border}`,
          background: settings.bgColor,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {tabs.map((tab, idx) => (
          <div
            key={tab.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              cursor: "pointer",
              borderBottom: idx === activeTabIdx ? `2px solid ${settings.accentColor}` : "2px solid transparent",
              background: idx === activeTabIdx ? `${settings.accentColor}08` : "transparent",
              flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            {renamingTabIdx === idx ? (
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => {
                  if (renameText.trim()) {
                    const name = renameText.trim();
                    setTabs((prev) => prev.map((t, i) => i === idx ? { ...t, label: name, customLabel: true } : t));
                    // Also rename the zoomed node so breadcrumb matches
                    const tab = tabs[idx];
                    const zoomTarget = tab?.zoomStack?.[tab.zoomStack.length - 1];
                    if (zoomTarget) {
                      setNodes((prev) => updateText(prev, zoomTarget, name));
                    }
                  }
                  setRenamingTabIdx(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.target.blur(); }
                  if (e.key === "Escape") { setRenamingTabIdx(null); }
                }}
                style={{
                  background: "none", border: "none", outline: "none",
                  color: settings.textColor, fontSize: 13, fontWeight: 600,
                  fontFamily: T.font, padding: 0, width: 100,
                }}
              />
            ) : (
              <button
                onClick={() => {
                  if (idx === activeTabIdx) {
                    setRenameText(tab.label);
                    setRenamingTabIdx(idx);
                  } else {
                    switchTab(idx);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: idx === activeTabIdx ? settings.textColor : T.textDim,
                  fontSize: 13,
                  fontWeight: idx === activeTabIdx ? 600 : 400,
                  fontFamily: T.font,
                  cursor: "pointer",
                  padding: 0,
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
                style={{
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: T.textFaint,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        ))}

        {/* New tab button */}
        <button
          onClick={() => {
            if (activeId) { commitEdit(activeId, editText); setActiveId(null); }
            const blankNode = makeNode("Untitled");
            const emptyChild = makeNode("");
            blankNode.ch = [emptyChild];
            setNodes((prev) => [...prev, blankNode]);
            const newTab = { id: `tab-${Date.now()}`, label: "Untitled", zoomStack: [blankNode.id], viewFormat: "outline" };
            setTabs((prev) => {
              const next = [...prev, newTab];
              setTimeout(() => setActiveTabIdx(next.length - 1), 0);
              return next;
            });
          }}
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textFaint,
            flexShrink: 0,
            marginLeft: 4,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Copy — flashes green */}
        <button
          onPointerDown={(e) => e.preventDefault()}
          onClick={copyPanel}
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: copyFlash ? "#69F0AE" : T.textFaint,
            flexShrink: 0, transition: "color 0.2s",
          }}
        >
          {copyFlash ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>

        {/* Format — changes panel view */}
        <div style={{ position: "relative", flexShrink: 0, marginLeft: 8 }}>
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { setFormatMenu(!formatMenu); setExportMenu(false); }}
            style={{
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: formatMenu ? `${settings.accentColor}18` : "none",
              border: "none", cursor: "pointer",
              color: formatMenu ? settings.accentColor : viewFormat !== "outline" ? settings.accentColor : T.textFaint,
              borderRadius: T.radiusSm, transition: "all 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="21" y1="10" x2="3" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="21" y1="18" x2="3" y2="18" />
            </svg>
          </button>

          {formatMenu && (
            <>
              <div onClick={() => setFormatMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: 40, right: 0, zIndex: 70,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, overflow: "hidden", minWidth: 170,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1, fontFamily: T.font }}>
                  View as
                </div>
                {[
                  { id: "outline", label: "Outline", icon: "•" },
                  { id: "markdown", label: "Markdown", icon: "#" },
                  { id: "board", label: "Board", icon: "▥" },
                  { id: "timeline", label: "Timeline", icon: "◷" },
                  { id: "chat", label: "AI Chat", icon: "◈" },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => { setViewFormat(fmt.id); setFormatMenu(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "11px 12px", background: viewFormat === fmt.id ? `${settings.accentColor}14` : "none",
                      border: "none", color: viewFormat === fmt.id ? settings.accentColor : settings.textColor,
                      fontSize: 14, fontFamily: T.font, cursor: "pointer", textAlign: "left",
                      fontWeight: viewFormat === fmt.id ? 600 : 400,
                    }}
                  >
                    <span style={{ width: 24, textAlign: "center", fontSize: 16, fontWeight: 700 }}>{fmt.icon}</span>
                    {fmt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Export */}
        <div style={{ position: "relative", flexShrink: 0, marginLeft: 8, marginRight: 4 }}>
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { setExportMenu(!exportMenu); setFormatMenu(false); }}
            style={{
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: exportMenu ? `${settings.accentColor}18` : "none",
              border: "none", cursor: "pointer",
              color: exportMenu ? settings.accentColor : T.textFaint,
              borderRadius: T.radiusSm, transition: "all 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {exportMenu && (
            <>
              <div onClick={() => setExportMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: 40, right: 0, zIndex: 70,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, overflow: "hidden", minWidth: 170,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1, fontFamily: T.font }}>
                  Export
                </div>
                {[
                  { id: "markdown", label: "Markdown (.md)", icon: "📄" },
                  { id: "plain", label: "Text (.txt)", icon: "📝" },
                  { id: "json", label: "JSON (.json)", icon: "{ }" },
                  { id: "opml", label: "OPML (.opml)", icon: "📋" },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => exportPanel(fmt.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "11px 12px", background: "none", border: "none",
                      color: settings.textColor, fontSize: 14, fontFamily: T.font,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 15, width: 24, textAlign: "center" }}>{fmt.icon}</span>
                    {fmt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {/* ═══ SEARCH / FILTER ═══ */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: searchOpen ? 200 : 0,
          transition: "max-height 0.25s ease-out",
          flexShrink: 0,
        }}
      >
        <div style={{
          padding: "10px 16px 12px",
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}>
          {/* Search input */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textDim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px 10px 38px",
                borderRadius: T.radiusSm,
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${T.border}`,
                color: T.text,
                fontSize: 15,
                fontFamily: T.font,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  width: 24, height: 24, borderRadius: 12, background: "rgba(255,255,255,0.1)",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.textDim,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FilterChip
              label="★ Starred"
              active={filters.star}
              color="#FFD740"
              onClick={() => setFilters((p) => ({ ...p, star: !p.star }))}
            />
            <FilterChip label="☐ Tasks" active={filters.todo === "todo"} color="#03DAC6" onClick={() => toggleFilter("todo", "todo")} />
            <FilterChip label="✓ Done" active={filters.todo === "done"} color="#69F0AE" onClick={() => toggleFilter("todo", "done")} />
            {NODE_TYPES.filter((t) => t.id).map((nt) => (
              <FilterChip key={nt.id} label={`${nt.icon} ${nt.label}`} active={filters.type === nt.id} color={nt.color} onClick={() => toggleFilter("type", nt.id)} />
            ))}
            <FilterChip label="! Low" active={filters.pri === "low"} color={PRI_COLORS.low} onClick={() => toggleFilter("pri", "low")} />
            <FilterChip label="!! Med" active={filters.pri === "med"} color={PRI_COLORS.med} onClick={() => toggleFilter("pri", "med")} />
            <FilterChip label="!!! High" active={filters.pri === "high"} color={PRI_COLORS.high} onClick={() => toggleFilter("pri", "high")} />
            {HIGHLIGHTS.filter(Boolean).map((hl) => (
              <FilterChip
                key={hl}
                label={<span style={{ width: 10, height: 10, borderRadius: "50%", background: hl, display: "inline-block" }} />}
                active={filters.hl === hl}
                color={hl}
                onClick={() => toggleFilter("hl", hl)}
              />
            ))}
            {allTags.map((tag) => (
              <FilterChip
                key={tag}
                label={`#${tag}`}
                active={filters.tag === tag}
                color={T.accent}
                onClick={() => toggleFilter("tag", tag)}
              />
            ))}
          </div>

          {/* Active filter count + clear */}
          {isFilterActive && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <span style={{ fontSize: 12, color: T.textDim, fontFamily: T.font }}>
                {flatList.length} result{flatList.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => { setSearchQuery(""); setFilters({ star: false, pri: null, hl: null, tag: null, type: null, done: null }); }}
                style={{
                  background: "none", border: "none", color: T.teal, fontSize: 12,
                  fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                }}
              >Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ TOOLBAR — slides down when cursor is active ═══ */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: toolbarOpen ? 52 : 0,
          transition: selectMode ? "none" : "max-height 0.2s ease-out",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 12px",
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            minHeight: 44,
          }}
        >
        {selectMode ? (
          <>
            <span style={{ fontSize: 13, color: T.textDim, marginRight: 8, fontFamily: T.font }}>
              {selectedIds.size} selected
            </span>
            <div style={{ flex: 1 }} />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              }
              label="Copy"
              onClick={copySelected}
              color={T.teal}
            />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              }
              label="Delete"
              onClick={deleteSelected}
              color={T.red}
            />
            <div style={{ width: 1, height: 24, background: T.border, margin: "0 4px" }} />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              }
              label="Done"
              onClick={exitSelectMode}
              color={T.accent}
            />
          </>
        ) : (
          <>
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              }
              label="Outdent"
              onClick={doOutdent}
            />
            <ToolbarButton
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              }
              label="Indent"
              onClick={doIndent}
            />
          </>
        )}
        </div>
      </div>

      {/* ═══ SCROLLABLE OUTLINE ═══ */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: (viewFormat === "board" || viewFormat === "chat") ? "hidden" : "auto",
          overflowX: viewFormat === "board" ? "auto" : "hidden",
          WebkitOverflowScrolling: "touch",
          paddingBottom: viewFormat === "chat" ? 0 : 80,
          paddingTop: viewFormat === "chat" ? 0 : 8,
          WebkitUserSelect: selectMode ? "none" : "auto",
          userSelect: selectMode ? "none" : "auto",
          WebkitTouchCallout: selectMode ? "none" : "default",
        }}
        onPointerMove={handleTextPointerMove}
        onContextMenu={(e) => { if (!isEditing) e.preventDefault(); }}
      >
        {viewFormat === "markdown" ? (
          /* ═══ MARKDOWN VIEW ═══ */
          <div style={{
            padding: "16px 20px",
            ...textStyle,
            color: settings.textColor,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {visibleRootNodes.map((node) => (
              <MarkdownNode key={node.id} node={node} depth={0} textColor={settings.textColor} dimColor={T.textDim} accentColor={settings.accentColor} />
            ))}
          </div>
        ) : viewFormat === "board" ? (
          /* ═══ BOARD VIEW ═══ */
          <div style={{
            display: "flex",
            gap: 12,
            padding: "12px 12px 80px",
            minHeight: "100%",
            alignItems: "flex-start",
          }}>
            {visibleRootNodes.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                nodes={nodes}
                setNodes={setNodes}
                visibleRootNodes={visibleRootNodes}
                settings={settings}
                accentColor={settings.accentColor}
                textColor={settings.textColor}
                onZoom={(id) => { doZoom(id); setViewFormat("outline"); }}
                showToast={showToast}
              />
            ))}
            {/* Add column */}
            <button
              onClick={() => {
                const newCol = makeNode("New Column");
                const zoomId = zoomStack[zoomStack.length - 1];
                if (zoomId) {
                  setNodes((prev) => insertAsChild(prev, zoomId, newCol));
                } else {
                  setNodes((prev) => [...prev, newCol]);
                }
              }}
              style={{
                minWidth: 200,
                padding: "16px",
                borderRadius: T.radiusSm,
                border: `1.5px dashed ${T.textFaint}`,
                background: "transparent",
                color: T.textFaint,
                fontSize: 14,
                fontFamily: T.font,
                cursor: "pointer",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Column
            </button>
          </div>
        ) : viewFormat === "timeline" ? (
          /* ═══ TIMELINE VIEW ═══ */
          <TimelineView
            nodes={nodes}
            setNodes={setNodes}
            settings={settings}
            accentColor={settings.accentColor}
            textColor={settings.textColor}
            onTap={(id) => setEditSheet(id)}
            onEdit={(id) => setEditSheet(id)}
            showToast={showToast}
          />
        ) : viewFormat === "chat" ? (
          /* ═══ AI CHAT VIEW ═══ */
          <ChatView
            nodes={nodes}
            chatQueue={chatQueue}
            setChatQueue={setChatQueue}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatLoading={chatLoading}
            setChatLoading={setChatLoading}
            settings={settings}
            accentColor={settings.accentColor}
            textColor={settings.textColor}
            showToast={showToast}
            getNode={(id) => getNode(nodes, id)}
          />
        ) : (
        /* ═══ OUTLINE VIEW ═══ */
        <>
        {flatList.map(({ node, depth }) => {
          const isActive = activeId === node.id;
          const isSelected = selectedIds.has(node.id);
          const isDragSource = dragState?.id === node.id;
          const isDropBefore = dropTarget?.id === node.id && dropTarget.zone === "before";
          const isDropAfter = dropTarget?.id === node.id && dropTarget.zone === "after";
          const isDropChild = dropTarget?.id === node.id && dropTarget.zone === "child";
          const hasChildren = node.ch.length > 0;

          return (
            <div key={node.id} style={{ position: "relative" }}>
              {/* Drop indicator: before */}
              {isDropBefore && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 16 + depth * INDENT_PX + BULLET_SIZE / 2 - 4,
                    right: 16,
                    height: 3,
                    background: T.teal,
                    borderRadius: 2,
                    zIndex: 5,
                    boxShadow: `0 0 8px ${T.teal}66`,
                  }}
                />
              )}

              {/* Swipe container */}
              <div
                style={{ position: "relative", overflow: "hidden" }}
                onTouchStart={(e) => handleSwipeStart(e, node.id)}
                onTouchMove={(e) => handleSwipeMove(e, node.id)}
                onTouchEnd={handleSwipeEnd}
              >
                {/* Row content — slides left on swipe */}
                <div
                  ref={(el) => (rowRefs.current[node.id] = el)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    paddingLeft: 16 + depth * INDENT_PX,
                    paddingRight: 16,
                    minHeight: ROW_MIN_H,
                    opacity: isDragSource ? 0.3 : 1,
                    background: isDropChild
                      ? `${T.teal}12`
                      : isSelected
                      ? `${settings.accentColor}14`
                      : settings.bgColor,
                    borderLeft: isDropChild ? `3px solid ${T.teal}` : "3px solid transparent",
                    transition: "transform 0.2s ease-out, background 0.1s, opacity 0.1s",
                    transform: swipedId === node.id ? "translateX(-416px)" : "translateX(0)",
                  }}
                >
                {/* Bullet — height matches one line of text so dot centers with cursor */}
                <div
                  onPointerDown={(e) => {
                    if (selectMode) {
                      e.preventDefault();
                      toggleSelect(node.id);
                      return;
                    }
                    handleBulletPointerDown(e, node.id);
                  }}
                  onPointerMove={handleBulletPointerMove}
                  onPointerUp={(e) => {
                    if (selectMode) return;
                    handleBulletPointerUp(e, node.id);
                  }}
                  style={{
                    width: BULLET_SIZE,
                    minWidth: BULLET_SIZE,
                    height: Math.ceil(settings.fontSize * settings.lineHeight),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isDragging ? "grabbing" : "pointer",
                    flexShrink: 0,
                    marginTop: 8,
                    touchAction: "none",
                  }}
                >
                  {(node.type === "task" || node.type === "recurring") ? (
                    /* Checkbox for task/recurring items */
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        border: `2px solid ${node.done ? "#69F0AE" : "#03DAC6"}`,
                        background: node.done ? "#69F0AE" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      {node.done && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={settings.bgColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  ) : (
                    /* Normal bullet dot */
                    <div
                      style={{
                        width: selectMode ? 18 : hasChildren ? 9 : 7,
                        height: selectMode ? 18 : hasChildren ? 9 : 7,
                        borderRadius: "50%",
                        background: selectMode
                          ? isSelected ? settings.accentColor : "transparent"
                          : isDragSource
                          ? T.teal
                          : isActive
                          ? settings.accentColor
                          : hasChildren
                          ? settings.textColor
                          : T.textDim,
                        border: selectMode
                          ? `2px solid ${isSelected ? settings.accentColor : T.textFaint}`
                          : hasChildren ? `2px solid ${settings.textColor}` : "none",
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selectMode && isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={settings.bgColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>

                {/* Text — always an input so iOS focus works from user gesture */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minHeight: ROW_MIN_H - 16,
                    paddingTop: 8,
                    paddingBottom: 6,
                    minWidth: 0,
                  }}
                  onPointerDown={(e) => {
                    if (isActive) return; // Let input handle natively
                    handleTextPointerDown(e, node.id);
                  }}
                  onPointerUp={(e) => {
                    if (isActive) return;
                    handleTextPointerUp(e, node.id);
                  }}
                >
                  <textarea
                    data-outline-input
                    ref={(el) => {
                      inputRefs.current[node.id] = el;
                      // Auto-resize height to content
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                      // Focus newly created nodes (Enter key, Add item, zoom)
                      if (el && pendingFocusId.current === node.id) {
                        pendingFocusId.current = null;
                        el.focus({ preventScroll: true });
                      }
                    }}
                    rows={1}
                    value={isActive ? editText : node.t}
                    onChange={(e) => {
                      if (!isActive) activateNode(node.id);
                      setEditText(e.target.value);
                      // Auto-resize on type
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    onKeyDown={(e) => {
                      if (!isActive) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleEnter();
                      } else {
                        handleKeyDown(e);
                      }
                    }}
                    onBlur={() => { if (isActive) handleBlur(node.id); }}
                    onPaste={(e) => { if (isActive) handlePaste(e); }}
                    onFocus={() => {
                      if (!isActive && !selectMode) activateNode(node.id);
                    }}
                    placeholder="Empty"
                    style={{
                      ...textStyle,
                      background: "none",
                      border: "none",
                      outline: "none",
                      color: node.t || isActive ? settings.textColor : T.textFaint,
                      width: "100%",
                      padding: 0,
                      margin: 0,
                      resize: "none",
                      overflow: "hidden",
                      minHeight: Math.ceil(settings.fontSize * settings.lineHeight),
                      caretColor: isActive ? settings.accentColor : "transparent",
                      cursor: selectMode ? "pointer" : "text",
                      pointerEvents: isActive ? "auto" : "none",
                      WebkitUserSelect: isActive ? "auto" : "none",
                      userSelect: isActive ? "auto" : "none",
                      WebkitTouchCallout: isActive ? "default" : "none",
                      fontStyle: !node.t && !isActive ? "italic" : "normal",
                      opacity: !node.t && !isActive ? 0.4 : node.done ? 0.5 : 1,
                      textDecoration: node.done ? "line-through" : "none",
                      wordBreak: "break-word",
                    }}
                    autoComplete="off"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck={true}
                  />
                  {/* Metadata indicators */}
                  {(node.star || node.hl || node.pri || node.type || node.tags?.length > 0) && !isActive && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 4 }}>
                      {node.type && (() => {
                        const nt = NODE_TYPES.find((t) => t.id === node.type);
                        return nt ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: nt.color, background: `${nt.color}18`,
                            padding: "1px 5px", borderRadius: 4, fontFamily: T.font,
                          }}>{nt.icon} {nt.label}{node.done ? " ✓" : ""}</span>
                        ) : null;
                      })()}
                      {node.star && (
                        <span style={{ fontSize: 11, color: "#FFD740" }}>★</span>
                      )}
                      {node.pri && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: PRI_COLORS[node.pri],
                          background: `${PRI_COLORS[node.pri]}18`, padding: "1px 5px",
                          borderRadius: 4, fontFamily: T.font,
                        }}>{PRI_LABELS[node.pri]}</span>
                      )}
                      {node.hl && (
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", background: node.hl,
                        }} />
                      )}
                      {node.tags?.map((tag) => (
                        <span key={tag} style={{
                          fontSize: 10, color: settings.accentColor, background: `${settings.accentColor}14`,
                          padding: "1px 6px", borderRadius: 4, fontFamily: T.font,
                        }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chevron (collapse/expand) — right aligned */}
                {hasChildren && (
                  <button
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      doToggle(node.id);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      marginTop: 6,
                      flexShrink: 0,
                      color: T.textDim,
                      transform: node.col ? "rotate(0deg)" : "rotate(90deg)",
                      transition: "transform 0.15s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Swipe actions — revealed behind the row */}
              {swipedId === node.id && (
                <div
                  data-swipe-action
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 416,
                    display: "flex",
                    alignItems: "stretch",
                  }}
                >
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={node.type === "task" ? "#03DAC6" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" />{node.type === "task" && <polyline points="9 11 12 14 22 4" stroke="#03DAC6" strokeWidth="2.5" />}</svg>}
                    label={node.type === "task" ? "Task ✓" : "Task"}
                    bg={node.type === "task" ? "#03DAC622" : T.surfaceAlt}
                    color={node.type === "task" ? "#03DAC6" : T.textDim}
                    onClick={() => handleSwipeTask(node.id)}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={node.pri ? PRI_COLORS[node.pri] : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15V4" /><path d="M3 15l9-5 9 5" /><path d="M3 4l9 5 9-5" /></svg>}
                    label={node.pri ? PRI_LABELS[node.pri] : "Priority"}
                    bg={node.pri ? `${PRI_COLORS[node.pri]}22` : T.surfaceAlt}
                    color={node.pri ? PRI_COLORS[node.pri] : T.textDim}
                    onClick={() => handleSwipePriority(node.id)}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>}
                    label={node.tags?.length ? `#${node.tags.length}` : "Tag"}
                    bg={(node.tags?.length) ? `${T.accent}22` : T.surfaceAlt}
                    color={(node.tags?.length) ? T.accent : T.textDim}
                    onClick={() => handleSwipeTag(node.id)}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                    label="Timeline"
                    bg={T.surfaceAlt}
                    color="#FBBF24"
                    onClick={() => {
                      const today = new Date().toISOString().split("T")[0];
                      setNodes((prev) => updateNodeProp(prev, node.id, "sched", { date: today, time: null, dur: 30 }));
                      setSwipedId(null);
                      showToast("Added to today's timeline");
                    }}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                    label="AI Chat"
                    bg={T.surfaceAlt}
                    color="#F0ABFC"
                    onClick={() => {
                      setChatQueue((prev) => prev.includes(node.id) ? prev : [...prev, node.id]);
                      setSwipedId(null);
                      showToast("Sent to AI Chat");
                    }}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>}
                    label="Edit"
                    bg={T.surfaceAlt}
                    color="#38BDF8"
                    onClick={() => { setEditSheet(node.id); setSwipedId(null); }}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /></svg>}
                    label="Tab"
                    bg={T.surfaceAlt}
                    color={T.teal}
                    onClick={() => openInNewTab(node.id)}
                  />
                  <SwipeBtn
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
                    label="Delete"
                    bg={T.red}
                    color="#fff"
                    onClick={() => handleSwipeDelete(node.id)}
                  />
                </div>
              )}
              </div>


              {/* Drop indicator: after */}
              {isDropAfter && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 16 + depth * INDENT_PX + BULLET_SIZE / 2 - 4,
                    right: 16,
                    height: 3,
                    background: T.teal,
                    borderRadius: 2,
                    zIndex: 5,
                    boxShadow: `0 0 8px ${T.teal}66`,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Add item button at bottom when not editing */}
        {!isEditing && !selectMode && (
          <button
            onClick={() => {
              const newNode = makeNode("");
              pendingFocusId.current = newNode.id;
              const zoomId = zoomStack[zoomStack.length - 1];
              if (zoomId) {
                setNodes((prev) => insertAsChild(prev, zoomId, newNode));
              } else {
                setNodes((prev) => [...prev, newNode]);
              }
              setActiveId(newNode.id);
              setEditText("");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 16,
              marginTop: 8,
              padding: "8px 12px",
              background: "none",
              border: "none",
              color: T.textFaint,
              fontSize: 15,
              fontFamily: T.font,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add item
          </button>
        )}
        </>
        )}
      </div>

      {/* ═══ SETTINGS BOTTOM SHEET ═══ */}
      {showSettings && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowSettings(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 90,
            }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: T.surface,
              borderRadius: `${T.radiusSheet}px ${T.radiusSheet}px 0 0`,
              padding: "20px 20px 40px",
              zIndex: 100,
              maxHeight: "75vh",
              overflowY: "auto",
              animation: "sheetUp 0.25s ease-out",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: T.textFaint,
                margin: "0 auto 20px",
              }}
            />

            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, fontFamily: T.font }}>
              Settings
            </div>

            {/* Pill Nav */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
              {[
                { id: "theme", label: "Theme" },
                { id: "account", label: "Account" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  style={{
                    flex: 1, padding: "8px 16px", borderRadius: 8,
                    background: settingsTab === tab.id ? settings.accentColor : "transparent",
                    border: "none",
                    color: settingsTab === tab.id ? settings.bgColor : T.textDim,
                    fontSize: 13, fontWeight: 600, fontFamily: T.font,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >{tab.label}</button>
              ))}
            </div>

            {settingsTab === "theme" ? (
            <>
            {/* Themes */}
            <SettingRow label="Theme">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => applyTheme(theme.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "10px 8px",
                      borderRadius: T.radiusSm,
                      border: `1.5px solid ${settings.theme === theme.id ? settings.accentColor : T.border}`,
                      background: settings.theme === theme.id ? `${settings.accentColor}18` : theme.bgColor,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      width: 72,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{theme.emoji}</span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: settings.theme === theme.id ? settings.accentColor : theme.textColor,
                      fontFamily: T.font,
                    }}>{theme.label}</span>
                    <div style={{
                      width: "100%", height: 3, borderRadius: 2,
                      background: theme.accentColor, opacity: 0.6,
                    }} />
                  </button>
                ))}

                {/* Custom themes */}
                {customThemes.map((theme) => (
                  <div key={theme.id} style={{ position: "relative" }}>
                    <button
                      onClick={() => applyTheme(theme.id)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        padding: "10px 8px",
                        borderRadius: T.radiusSm,
                        border: `1.5px solid ${settings.theme === theme.id ? settings.accentColor : T.border}`,
                        background: settings.theme === theme.id ? `${settings.accentColor}18` : theme.bgColor,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        width: 72,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{theme.emoji}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: settings.theme === theme.id ? settings.accentColor : theme.textColor,
                        fontFamily: T.font,
                      }}>{theme.label}</span>
                      <div style={{
                        width: "100%", height: 3, borderRadius: 2,
                        background: theme.accentColor, opacity: 0.6,
                      }} />
                    </button>
                    <button
                      onClick={() => handleDeleteCustomTheme(theme.id)}
                      style={{
                        position: "absolute", top: -6, right: -6,
                        width: 18, height: 18, borderRadius: 9,
                        background: T.red, border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Save current as theme */}
                <button
                  onClick={() => setSaveThemeSheet(true)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "10px 8px",
                    borderRadius: T.radiusSm,
                    border: `1.5px dashed ${T.textFaint}`,
                    background: "transparent",
                    cursor: "pointer",
                    width: 72,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textFaint, fontFamily: T.font }}>Save</span>
                </button>
              </div>
            </SettingRow>

            {/* Font Family */}
            <SettingRow label="Font">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => updateSetting("fontFamily", f.label)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: T.radiusSm,
                      border: `1.5px solid ${settings.fontFamily === f.label ? T.accent : T.border}`,
                      background: settings.fontFamily === f.label ? `${T.accent}18` : "transparent",
                      color: settings.fontFamily === f.label ? T.accent : T.text,
                      fontFamily: f.value,
                      fontSize: 14,
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Font Size */}
            <SettingRow label="Size">
              <Stepper
                value={settings.fontSize}
                min={13}
                max={22}
                step={1}
                format={(v) => `${v}px`}
                onChange={(v) => updateSetting("fontSize", v)}
              />
            </SettingRow>

            {/* Font Weight */}
            <SettingRow label="Weight">
              <Stepper
                value={settings.fontWeight}
                min={300}
                max={700}
                step={100}
                format={(v) =>
                  v === 300 ? "Light" : v === 400 ? "Regular" : v === 500 ? "Medium" : v === 600 ? "Semi" : "Bold"
                }
                onChange={(v) => updateSetting("fontWeight", v)}
              />
            </SettingRow>

            {/* Line Height */}
            <SettingRow label="Line Height">
              <Stepper
                value={settings.lineHeight}
                min={1.0}
                max={2.2}
                step={0.2}
                format={(v) => v.toFixed(1)}
                onChange={(v) => updateSetting("lineHeight", Math.round(v * 10) / 10)}
              />
            </SettingRow>

            {/* Letter Spacing */}
            <SettingRow label="Spacing">
              <Stepper
                value={settings.letterSpacing}
                min={-0.5}
                max={1.0}
                step={0.25}
                format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
                onChange={(v) => updateSetting("letterSpacing", Math.round(v * 100) / 100)}
              />
            </SettingRow>

            {/* Text Color */}
            <SettingRow label="Text Color">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["#E0E0E0", "#FFFFFF", "#C8C8C8", "#1A1A1A", "#2D2D2D", "#3C2415", "#1B4332", "#1E3A5F", "#00FF41", "#FFD740"].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSetting("textColor", c)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: c,
                      border: `2px solid ${settings.textColor === c ? settings.accentColor : T.border}`,
                      cursor: "pointer",
                      position: "relative",
                      transition: "border-color 0.12s",
                    }}
                  >
                    {settings.textColor === c && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={settings.bgColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Accent Color */}
            <SettingRow label="Accent Color">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["#BB86FC", "#03DAC6", "#3B82F6", "#00FF41", "#FBBF24", "#E8651A", "#F0ABFC", "#38BDF8", "#CF6679", "#69F0AE"].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSetting("accentColor", c)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: c,
                      border: `2px solid ${settings.accentColor === c ? "#fff" : T.border}`,
                      cursor: "pointer",
                      position: "relative",
                      transition: "border-color 0.12s",
                    }}
                  >
                    {settings.accentColor === c && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={settings.bgColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Background */}
            <SettingRow label="Background">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {BG_OPTIONS.map((bg) => (
                  <button
                    key={bg.value}
                    onClick={() => updateSetting("bgColor", bg.value)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: bg.value,
                      border: `2px solid ${settings.bgColor === bg.value ? T.accent : T.border}`,
                      cursor: "pointer",
                      position: "relative",
                      transition: "border-color 0.12s",
                    }}
                  >
                    {settings.bgColor === bg.value && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={T.accent}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Preview */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: T.radius,
                background: settings.bgColor,
                border: `1px solid ${T.border}`,
              }}
            >
              <div style={{ ...textStyle, color: settings.textColor }}>
                The quick brown fox jumps over the lazy dog.
              </div>
            </div>
            </>
            ) : (
            <>
            {/* Account / API Settings */}
            <SettingRow label="AI Provider">
              <div style={{ display: "flex", gap: 8 }}>
                {["anthropic"].map((p) => (
                  <button
                    key={p}
                    onClick={() => updateSetting("aiProvider", p)}
                    style={{
                      padding: "8px 16px", borderRadius: T.radiusSm,
                      border: `1.5px solid ${settings.aiProvider === p ? settings.accentColor : T.border}`,
                      background: settings.aiProvider === p ? `${settings.accentColor}18` : "transparent",
                      color: settings.aiProvider === p ? settings.accentColor : T.textDim,
                      fontSize: 13, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >{p}</button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label="AI Model">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {AI_MODELS.filter((m) => m.provider === settings.aiProvider).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => updateSetting("aiModel", m.id)}
                    style={{
                      padding: "8px 14px", borderRadius: T.radiusSm,
                      border: `1.5px solid ${settings.aiModel === m.id ? settings.accentColor : T.border}`,
                      background: settings.aiModel === m.id ? `${settings.accentColor}18` : "transparent",
                      color: settings.aiModel === m.id ? settings.accentColor : T.textDim,
                      fontSize: 13, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                    }}
                  >{m.label}</button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label="API Key">
              <input
                type="password"
                value={settings.apiKey || ""}
                onChange={(e) => updateSetting("apiKey", e.target.value)}
                placeholder="sk-ant-..."
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: T.radiusSm,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                  color: settings.textColor, fontSize: 14, fontFamily: "'Fira Code', monospace",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6, fontFamily: T.font }}>
                {settings.apiKey ? "✓ Key saved (stored locally)" : "Required for AI Chat when running standalone"}
              </div>
            </SettingRow>

            <SettingRow label="Chat">
              <button
                onClick={() => { setChatMessages([]); showToast("Chat history cleared"); }}
                style={{
                  padding: "8px 16px", borderRadius: T.radiusSm,
                  background: "none", border: `1px solid ${T.border}`,
                  color: T.red, fontSize: 13, fontFamily: T.font, cursor: "pointer",
                }}
              >Clear chat history</button>
            </SettingRow>

            <SettingRow label="Data">
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    try {
                      await db.remove(STORAGE_KEY);
                      await db.remove(USER_KEY);
                      showToast("All data cleared — refresh to reset");
                    } catch (e) { showToast("Error clearing data"); }
                  }}
                  style={{
                    padding: "8px 16px", borderRadius: T.radiusSm,
                    background: "none", border: `1px solid ${T.red}`,
                    color: T.red, fontSize: 13, fontFamily: T.font, cursor: "pointer",
                  }}
                >Reset all data</button>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6, fontFamily: T.font }}>
                This will clear all notes, settings, and themes. Cannot be undone.
              </div>
            </SettingRow>
            </>
            )}
          </div>
        </>
      )}

      {/* ═══ SIDEBAR ═══ */}
      {sidebarOpen && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: 280,
              background: T.surface,
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              animation: "slideInLeft 0.2s ease-out",
            }}
          >
            {/* Sidebar header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 16px 12px", borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 22 }}>🧠</span>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", borderRadius: T.radiusSm,
                  cursor: "pointer", color: T.textDim,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Menu items — ready to populate */}
            <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
            </div>
          </div>
        </>
      )}

      {/* ═══ AUTH SHEET ═══ */}
      {authSheet && (
        <>
          <div onClick={() => setAuthSheet(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: T.surface, borderRadius: `${T.radiusSheet}px ${T.radiusSheet}px 0 0`,
            padding: "20px 20px 40px", zIndex: 100, maxHeight: "80vh", overflowY: "auto",
            animation: "sheetUp 0.25s ease-out",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textFaint, margin: "0 auto 16px" }} />

            {isLoggedIn ? (
              /* ═══ PROFILE VIEW ═══ */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 24,
                    background: settings.accentColor, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700, color: settings.bgColor, fontFamily: T.font,
                  }}>{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: settings.textColor, fontFamily: T.font }}>{user.name}</div>
                    <div style={{ fontSize: 13, color: T.textDim, fontFamily: T.font }}>{user.email}</div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: settings.accentColor,
                      background: `${settings.accentColor}18`, padding: "2px 8px", borderRadius: 10,
                      display: "inline-block", marginTop: 4, fontFamily: T.font,
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>{user.plan} plan</div>
                  </div>
                </div>

                {/* Edit name */}
                <SettingRow label="Display Name">
                  <input
                    type="text"
                    value={user.name}
                    onChange={(e) => authActions.updateProfile({ name: e.target.value })}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: T.radiusSm,
                      background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                      color: settings.textColor, fontSize: 14, fontFamily: T.font, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </SettingRow>

                {user.plan === "free" && (
                  <button
                    onClick={() => showToast("Upgrade — coming soon")}
                    style={{
                      width: "100%", padding: "12px", borderRadius: T.radiusSm, marginBottom: 16,
                      background: `linear-gradient(135deg, ${settings.accentColor}, ${T.teal})`,
                      border: "none", color: settings.bgColor,
                      fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: "pointer",
                    }}
                  >Upgrade to Pro</button>
                )}

                <button
                  onClick={() => { authActions.signOut(); showToast("Signed out"); }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: T.radiusSm,
                    background: "none", border: `1px solid ${T.border}`,
                    color: T.red, fontSize: 14, fontFamily: T.font, cursor: "pointer",
                  }}
                >Sign Out</button>
              </>
            ) : (
              /* ═══ LOGIN / SIGNUP VIEW ═══ */
              <>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, fontFamily: T.font, color: settings.textColor, textAlign: "center" }}>
                  {authMode === "login" ? "Welcome back" : "Create account"}
                </div>
                <div style={{ fontSize: 13, color: T.textDim, fontFamily: T.font, textAlign: "center", marginBottom: 24 }}>
                  {authMode === "login" ? "Sign in to sync your brain" : "Start organizing your thoughts"}
                </div>

                {/* OAuth buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  <button
                    onClick={() => { authActions.signInWithProvider("google"); showToast("Signing in with Google..."); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      width: "100%", padding: "12px", borderRadius: T.radiusSm,
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
                      color: settings.textColor, fontSize: 14, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Continue with Google
                  </button>
                  <button
                    onClick={() => { authActions.signInWithProvider("apple"); showToast("Signing in with Apple..."); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      width: "100%", padding: "12px", borderRadius: T.radiusSm,
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
                      color: settings.textColor, fontSize: 14, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={settings.textColor}><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.1 4.45-3.74 4.25z"/></svg>
                    Continue with Apple
                  </button>
                </div>

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                  <span style={{ fontSize: 12, color: T.textFaint, fontFamily: T.font }}>or</span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                </div>

                {/* Email form */}
                {authMode === "signup" && (
                  <input
                    type="text"
                    value={authForm.name}
                    onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your name"
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: T.radiusSm, marginBottom: 10,
                      background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                      color: settings.textColor, fontSize: 14, fontFamily: T.font, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                )}
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: T.radiusSm, marginBottom: 10,
                    background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                    color: settings.textColor, fontSize: 14, fontFamily: T.font, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Password"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: T.radiusSm, marginBottom: 16,
                    background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                    color: settings.textColor, fontSize: 14, fontFamily: T.font, outline: "none",
                    boxSizing: "border-box",
                  }}
                />

                <button
                  onClick={() => {
                    if (!authForm.email || !authForm.password) { showToast("Fill in all fields"); return; }
                    if (authMode === "login") {
                      authActions.signIn({ email: authForm.email, password: authForm.password });
                      showToast("Signed in");
                    } else {
                      authActions.signUp({ email: authForm.email, password: authForm.password, name: authForm.name });
                      showToast("Account created");
                    }
                  }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: T.radiusSm, marginBottom: 16,
                    background: settings.accentColor, border: "none", color: settings.bgColor,
                    fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: "pointer",
                  }}
                >{authMode === "login" ? "Sign In" : "Create Account"}</button>

                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                    style={{
                      background: "none", border: "none", color: settings.accentColor,
                      fontSize: 13, fontFamily: T.font, cursor: "pointer",
                    }}
                  >
                    {authMode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ═══ SAVE THEME SHEET ═══ */}
      {saveThemeSheet && (
        <>
          <div
            onClick={() => setSaveThemeSheet(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 110 }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0, left: 0, right: 0,
              background: T.surface,
              borderRadius: `${T.radiusSheet}px ${T.radiusSheet}px 0 0`,
              padding: "20px 20px 40px",
              zIndex: 120,
              animation: "sheetUp 0.25s ease-out",
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textFaint, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, fontFamily: T.font }}>Save Theme</div>

            {/* Preview bar */}
            <div style={{
              padding: 12, borderRadius: T.radiusSm, marginBottom: 16,
              background: settings.bgColor, border: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 24 }}>{newThemeEmoji}</span>
              <div style={{
                fontSize: settings.fontSize, fontFamily: FONT_OPTIONS.find((f) => f.label === settings.fontFamily)?.value || T.font,
                fontWeight: settings.fontWeight, color: settings.textColor,
              }}>
                {newThemeName || "My Theme"}
              </div>
              <div style={{ marginLeft: "auto", width: 24, height: 4, borderRadius: 2, background: settings.accentColor }} />
            </div>

            {/* Emoji picker row */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: T.font }}>Emoji</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["🎨", "🖤", "🔥", "⚡", "🌿", "💎", "🛠️", "🎵", "☕", "🌙", "🏔️", "✨"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewThemeEmoji(e)}
                    style={{
                      width: 40, height: 40, fontSize: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: T.radiusSm,
                      border: `1.5px solid ${newThemeEmoji === e ? settings.accentColor : T.border}`,
                      background: newThemeEmoji === e ? `${settings.accentColor}18` : "transparent",
                      cursor: "pointer",
                    }}
                  >{e}</button>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveCustomTheme(); } }}
                placeholder="Theme name..."
                autoFocus
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: T.radiusSm,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                  color: T.text, fontSize: 15, fontFamily: T.font, outline: "none",
                }}
              />
              <button
                onClick={handleSaveCustomTheme}
                style={{
                  padding: "10px 16px", borderRadius: T.radiusSm,
                  background: settings.accentColor, border: "none", color: settings.bgColor,
                  fontSize: 14, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                  opacity: newThemeName.trim() ? 1 : 0.4,
                }}
              >Save</button>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAG SHEET ═══ */}
      {tagSheet && (
        <>
          <div
            onClick={() => setTagSheet(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0, left: 0, right: 0,
              background: T.surface,
              borderRadius: `${T.radiusSheet}px ${T.radiusSheet}px 0 0`,
              padding: "20px 20px 40px",
              zIndex: 100,
              animation: "sheetUp 0.25s ease-out",
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textFaint, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, fontFamily: T.font }}>Tags</div>

            {/* Existing tags */}
            {tagSheet.tags?.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {tagSheet.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "6px 12px", borderRadius: 20,
                      background: `${T.accent}18`, border: `1px solid ${T.accent}44`,
                      color: T.accent, fontSize: 13, fontFamily: T.font,
                      cursor: "pointer",
                    }}
                  >
                    #{tag}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                ))}
              </div>
            )}

            {/* Add tag input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag..."
                autoFocus
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: T.radiusSm,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                  color: T.text, fontSize: 15, fontFamily: T.font, outline: "none",
                }}
              />
              <button
                onClick={addTag}
                style={{
                  padding: "10px 16px", borderRadius: T.radiusSm,
                  background: T.accent, border: "none", color: T.bg,
                  fontSize: 14, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                }}
              >Add</button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EDIT / METADATA SHEET ═══ */}
      {editSheet && (() => {
        const eNode = getNode(nodes, editSheet);
        if (!eNode) return null;
        const updateProp = (key, val) => setNodes((prev) => updateNodeProp(prev, editSheet, key, val));
        return (
        <>
          <div onClick={() => setEditSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: T.surface, borderRadius: `${T.radiusSheet}px ${T.radiusSheet}px 0 0`,
            padding: "20px 20px 40px", zIndex: 100, maxHeight: "80vh", overflowY: "auto",
            animation: "sheetUp 0.25s ease-out",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textFaint, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, fontFamily: T.font, color: settings.textColor }}>Edit Item</div>

            {/* Title */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Title</div>
              <input
                type="text"
                value={eNode.t}
                onChange={(e) => setNodes((prev) => updateText(prev, editSheet, e.target.value))}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: T.radiusSm,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                  color: settings.textColor, fontSize: 15, fontFamily: T.font, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Note</div>
              <textarea
                value={eNode.note || ""}
                onChange={(e) => updateProp("note", e.target.value)}
                placeholder="Add a description or note..."
                rows={3}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: T.radiusSm,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                  color: settings.textColor, fontSize: 14, fontFamily: T.font, outline: "none",
                  resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Type</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {NODE_TYPES.map((nt) => (
                  <button key={nt.label} onClick={() => updateProp("type", nt.id)} style={{
                    padding: "7px 12px", borderRadius: T.radiusSm,
                    border: `1.5px solid ${eNode.type === nt.id ? nt.color : T.border}`,
                    background: eNode.type === nt.id ? `${nt.color}18` : "transparent",
                    color: eNode.type === nt.id ? nt.color : T.textDim,
                    fontSize: 12, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                  }}>{nt.icon} {nt.label}</button>
                ))}
              </div>
              {(eNode.type === "task" || eNode.type === "recurring") && (
                <button
                  onClick={() => updateProp("done", !eNode.done)}
                  style={{
                    marginTop: 10, padding: "8px 14px", borderRadius: T.radiusSm,
                    border: `1.5px solid ${eNode.done ? "#69F0AE" : T.border}`,
                    background: eNode.done ? "#69F0AE18" : "transparent",
                    color: eNode.done ? "#69F0AE" : T.textDim,
                    fontSize: 13, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {eNode.done ? "✓ Completed" : "○ Mark as done"}
                </button>
              )}
            </div>

            {/* Priority */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Priority</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { val: null, label: "None", color: T.textDim },
                  { val: "low", label: "Low", color: PRI_COLORS.low },
                  { val: "med", label: "Med", color: PRI_COLORS.med },
                  { val: "high", label: "High", color: PRI_COLORS.high },
                ].map((opt) => (
                  <button key={opt.label} onClick={() => updateProp("pri", opt.val)} style={{
                    flex: 1, padding: "8px 10px", borderRadius: T.radiusSm,
                    border: `1.5px solid ${eNode.pri === opt.val ? opt.color : T.border}`,
                    background: eNode.pri === opt.val ? `${opt.color}18` : "transparent",
                    color: eNode.pri === opt.val ? opt.color : T.textDim,
                    fontSize: 13, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                  }}>{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Star & Highlight row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Star</div>
                <button onClick={() => updateProp("star", !eNode.star)} style={{
                  width: "100%", padding: "8px", borderRadius: T.radiusSm,
                  border: `1.5px solid ${eNode.star ? "#FFD740" : T.border}`,
                  background: eNode.star ? "#FFD74018" : "transparent",
                  color: eNode.star ? "#FFD740" : T.textDim,
                  fontSize: 18, cursor: "pointer",
                }}>{eNode.star ? "★" : "☆"}</button>
              </div>
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Highlight</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {HIGHLIGHTS.map((hl, i) => (
                    <button key={i} onClick={() => updateProp("hl", hl)} style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: hl || "transparent",
                      border: `2px solid ${eNode.hl === hl ? (hl ? hl : settings.accentColor) : T.border}`,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      color: T.textDim, fontSize: 14,
                    }}>{!hl && "×"}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Tags</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: eNode.tags?.length ? 8 : 0 }}>
                {eNode.tags?.map((tag) => (
                  <button key={tag} onClick={() => {
                    const updated = eNode.tags.filter((t) => t !== tag);
                    updateProp("tags", updated);
                  }} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 16,
                    background: `${settings.accentColor}18`, border: `1px solid ${settings.accentColor}44`,
                    color: settings.accentColor, fontSize: 12, fontFamily: T.font, cursor: "pointer",
                  }}>
                    #{tag}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Add tag..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      const tag = e.target.value.trim().replace(/^#/, "");
                      if (tag && !(eNode.tags || []).includes(tag)) {
                        updateProp("tags", [...(eNode.tags || []), tag]);
                      }
                      e.target.value = "";
                    }
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: T.radiusSm,
                    background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                    color: settings.textColor, fontSize: 13, fontFamily: T.font, outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Schedule */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.font }}>Schedule</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  value={eNode.sched?.date || ""}
                  onChange={(e) => updateProp("sched", { ...(eNode.sched || { time: null, dur: 30 }), date: e.target.value || null })}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: T.radiusSm,
                    background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                    color: settings.textColor, fontSize: 13, fontFamily: T.font, outline: "none",
                    colorScheme: "dark",
                  }}
                />
                <input
                  type="time"
                  value={eNode.sched?.time || ""}
                  onChange={(e) => updateProp("sched", { ...(eNode.sched || { date: new Date().toISOString().split("T")[0], dur: 30 }), time: e.target.value || null })}
                  style={{
                    width: 110, padding: "8px 12px", borderRadius: T.radiusSm,
                    background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
                    color: settings.textColor, fontSize: 13, fontFamily: T.font, outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </div>
              {eNode.sched?.date && (
                <button
                  onClick={() => updateProp("sched", null)}
                  style={{
                    marginTop: 8, padding: "6px 12px", borderRadius: T.radiusSm,
                    background: "none", border: `1px solid ${T.border}`,
                    color: T.red, fontSize: 12, fontFamily: T.font, cursor: "pointer",
                  }}
                >Remove from timeline</button>
              )}
            </div>

            {/* Done button */}
            <button
              onClick={() => setEditSheet(null)}
              style={{
                width: "100%", padding: "12px", borderRadius: T.radiusSm,
                background: settings.accentColor, border: "none", color: settings.bgColor,
                fontSize: 15, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
              }}
            >Done</button>
          </div>
        </>
        );
      })()}

      {/* ═══ TOAST ═══ */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: T.surfaceAlt,
            color: T.text,
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontFamily: T.font,
            zIndex: 200,
            border: `1px solid ${T.border}`,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
