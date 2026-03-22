import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { T } from '../lib/tokens';
import { NODE_TYPES, PRI_COLORS, PRI_LABELS } from '../lib/nodes';
import { updateNodeProp } from '../lib/tree';

function TimelineView({ nodes, setNodes, settings, accentColor, textColor, onTap, onEdit, showToast }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dragId, setDragId] = useState(null);
  const [dragHour, setDragHour] = useState(null);
  const hourRefs = useRef({});
  const dragTimer = useRef(null);
  const dragActive = useRef(false);

  // Collect all scheduled nodes from entire tree
  const scheduled = useMemo(() => {
    const result = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.sched?.date === selectedDate) result.push(n);
        walk(n.ch);
      }
    };
    walk(nodes);
    return result.sort((a, b) => {
      if (a.sched?.time && b.sched?.time) return a.sched.time.localeCompare(b.sched.time);
      if (a.sched?.time) return -1;
      if (b.sched?.time) return 1;
      return 0;
    });
  }, [nodes, selectedDate]);

  const timed = scheduled.filter((n) => n.sched?.time);
  const untimed = scheduled.filter((n) => !n.sched?.time);

  const hours = [];
  for (let h = 6; h <= 22; h++) hours.push(h);

  const navigateDay = (offset) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatHour = (h) => {
    if (h === 0 || h === 12) return h === 0 ? "12 AM" : "12 PM";
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  };

  // Drag to reschedule
  const startCardDrag = useCallback((nodeId) => {
    setDragId(nodeId);
    dragActive.current = true;
    window.getSelection()?.removeAllRanges();
    // Nuclear: suppress all text selection during drag
    const style = document.createElement("style");
    style.id = "timeline-drag-lock";
    style.textContent = `* { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }`;
    document.head.appendChild(style);
  }, []);

  const handleTimelineTouchEnd = useCallback(() => {
    if (dragActive.current && dragId && dragHour) {
      setNodes((prev) => updateNodeProp(prev, dragId, "sched", {
        date: selectedDate,
        time: dragHour,
        dur: 30,
      }));
      showToast(`Moved to ${dragHour}`);
    }
    setDragId(null);
    setDragHour(null);
    dragActive.current = false;
    clearTimeout(dragTimer.current);
    // Remove nuclear style
    const el = document.getElementById("timeline-drag-lock");
    if (el) el.remove();
  }, [dragId, dragHour, selectedDate, setNodes, showToast]);

  const timelineRef = useRef(null);

  // Attach non-passive touchmove to block sandbox pull-down during drag
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const handler = (e) => {
      if (dragActive.current) {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches?.[0];
        if (!touch) return;
        for (const h of hours) {
          const hEl = hourRefs.current[h];
          if (!hEl) continue;
          const rect = hEl.getBoundingClientRect();
          if (touch.clientY >= rect.top && touch.clientY < rect.bottom) {
            const pct = (touch.clientY - rect.top) / rect.height;
            const min = pct < 0.5 ? "00" : "30";
            setDragHour(`${String(h).padStart(2, "0")}:${min}`);
            return;
          }
        }
      }
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, [hours]);

  return (
    <div
      ref={timelineRef}
      style={{ padding: "0", minHeight: "100%", touchAction: dragId ? "none" : "auto" }}
      onTouchEnd={handleTimelineTouchEnd}
    >
      {/* Day navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: `1px solid ${T.border}`,
        position: "sticky", top: 0, background: settings.bgColor, zIndex: 5,
      }}>
        <button onClick={() => navigateDay(-1)} style={{
          width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`, cursor: "pointer", color: T.textDim,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: textColor, fontFamily: T.font }}>
            {formatDate(selectedDate)}
          </div>
          {!isToday && (
            <button onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])} style={{
              background: "none", border: "none", color: accentColor, fontSize: 11, fontWeight: 600,
              fontFamily: T.font, cursor: "pointer", marginTop: 2,
            }}>Today</button>
          )}
        </div>

        <button onClick={() => navigateDay(1)} style={{
          width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`, cursor: "pointer", color: T.textDim,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Unscheduled tray */}
      {untimed.length > 0 && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: T.font }}>
            To schedule ({untimed.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {untimed.map((node) => (
              <TimelineCard key={node.id} node={node} accentColor={accentColor} textColor={textColor} settings={settings} onTap={onTap} onEdit={onEdit} isDragging={dragId === node.id} onDragStart={() => startCardDrag(node.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Hour grid */}
      <div style={{ position: "relative" }}>
        {hours.map((h) => {
          const hourStr = `${String(h).padStart(2, "0")}:`;
          const hourEvents = timed.filter((n) => n.sched?.time?.startsWith(hourStr));
          const isDropTarget = dragId && dragHour?.startsWith(hourStr);

          return (
            <div
              key={h}
              ref={(el) => (hourRefs.current[h] = el)}
              style={{
                display: "flex", minHeight: 60,
                borderBottom: `1px solid ${T.border}`,
                background: isDropTarget ? `${accentColor}12` : "transparent",
                transition: "background 0.1s",
              }}
            >
              {/* Hour label */}
              <div style={{
                width: 56, flexShrink: 0, padding: "6px 8px 0 0",
                textAlign: "right", fontSize: 11,
                color: isDropTarget ? accentColor : T.textDim,
                fontFamily: T.font, fontWeight: isDropTarget ? 700 : 500,
                transition: "color 0.1s",
              }}>
                {formatHour(h)}
              </div>

              {/* Events column */}
              <div style={{
                flex: 1, borderLeft: `1px solid ${isDropTarget ? accentColor : T.border}`,
                padding: "4px 8px", display: "flex", flexDirection: "column", gap: 4,
                transition: "border-color 0.1s",
              }}>
                {hourEvents.map((node) => (
                  <TimelineCard
                    key={node.id} node={node} accentColor={accentColor} textColor={textColor}
                    settings={settings} onTap={onTap} onEdit={onEdit} showTime
                    isDragging={dragId === node.id}
                    onDragStart={() => startCardDrag(node.id)}
                  />
                ))}
                {/* Drop indicator */}
                {isDropTarget && dragId && !hourEvents.find((n) => n.id === dragId) && (
                  <div style={{
                    padding: "8px 10px", borderRadius: 8,
                    border: `2px dashed ${accentColor}`,
                    color: accentColor, fontSize: 12, fontFamily: T.font,
                    textAlign: "center", opacity: 0.6,
                  }}>
                    Drop here — {dragHour}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {scheduled.length === 0 && (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, color: T.textDim, fontFamily: T.font, marginBottom: 4 }}>Nothing scheduled</div>
          <div style={{ fontSize: 12, color: T.textFaint, fontFamily: T.font }}>Swipe a bullet → Timeline to add items here</div>
        </div>
      )}
    </div>
  );
}

function TimelineCard({ node, accentColor, textColor, settings, onTap, onEdit, showTime, isDragging, onDragStart }) {
  const pressTimer = useRef(null);
  const moved = useRef(false);

  return (
    <div
      onTouchStart={(e) => {
        moved.current = false;
        pressTimer.current = setTimeout(() => {
          if (!moved.current && onDragStart) {
            onDragStart();
            // Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(30);
          }
        }, 400);
      }}
      onTouchMove={() => { moved.current = true; clearTimeout(pressTimer.current); }}
      onTouchEnd={() => clearTimeout(pressTimer.current)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 8,
        background: isDragging ? `${accentColor}18` : "rgba(255,255,255,0.04)",
        border: `1px solid ${isDragging ? accentColor : T.border}`,
        cursor: "pointer",
        opacity: isDragging ? 0.6 : 1,
        transition: "all 0.15s",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Drag handle */}
      {onDragStart && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, color: T.textFaint, padding: "0 2px" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="6" cy="6" r="2" /><circle cx="14" cy="6" r="2" />
            <circle cx="6" cy="14" r="2" /><circle cx="14" cy="14" r="2" />
            <circle cx="6" cy="22" r="2" /><circle cx="14" cy="22" r="2" />
          </svg>
        </div>
      )}

      {/* Checkbox or type icon */}
      {(node.type === "task" || node.type === "recurring") ? (
        <div style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `2px solid ${node.done ? "#69F0AE" : "#03DAC6"}`,
          background: node.done ? "#69F0AE" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {node.done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={settings.bgColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      ) : node.type ? (
        <span style={{ fontSize: 12, color: (NODE_TYPES.find((t) => t.id === node.type) || {}).color || T.textDim, flexShrink: 0 }}>
          {(NODE_TYPES.find((t) => t.id === node.type) || {}).icon || "•"}
        </span>
      ) : (
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.textDim, flexShrink: 0 }} />
      )}

      {/* Content */}
      <div onClick={() => !isDragging && onTap(node.id)} style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: textColor, fontFamily: T.font,
          wordBreak: "break-word", lineHeight: 1.4,
          textDecoration: node.done ? "line-through" : "none",
          opacity: node.done ? 0.5 : 1,
        }}>
          {node.t || "Untitled"}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
          {showTime && node.sched?.time && (
            <span style={{ fontSize: 10, color: accentColor, fontWeight: 600, fontFamily: T.font }}>
              {node.sched.time}
            </span>
          )}
          {node.pri && <span style={{ fontSize: 9, color: PRI_COLORS[node.pri], fontWeight: 700 }}>{PRI_LABELS[node.pri]}</span>}
          {node.star && <span style={{ fontSize: 9, color: "#FFD740" }}>★</span>}
          {node.tags?.length > 0 && <span style={{ fontSize: 9, color: T.textDim }}>#{node.tags[0]}{node.tags.length > 1 ? ` +${node.tags.length - 1}` : ""}</span>}
        </div>
      </div>

      {/* Edit button */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(node.id); }}
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: "rgba(255,255,255,0.05)", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: T.textDim,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  );
}

export default TimelineView;
