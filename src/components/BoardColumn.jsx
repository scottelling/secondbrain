import { useState } from 'react';
import { T } from '../lib/tokens';
import { NODE_TYPES, PRI_COLORS, PRI_LABELS } from '../lib/nodes';
import { updateText, removeFromTree, insertAsChild } from '../lib/tree';

function BoardColumn({ column, nodes, setNodes, visibleRootNodes, settings, accentColor, textColor, onZoom, showToast }) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerText, setHeaderText] = useState(column.t);
  const [moveCard, setMoveCard] = useState(null); // card id being moved

  const saveHeader = () => {
    setNodes((prev) => updateText(prev, column.id, headerText));
    setEditingHeader(false);
  };

  const handleMoveCard = (cardId, targetColId) => {
    setNodes((prev) => {
      const { tree, removed } = removeFromTree(prev, cardId);
      if (!removed) return prev;
      return insertAsChild(tree, targetColId, removed);
    });
    setMoveCard(null);
    showToast("Moved");
  };

  return (
    <div style={{
      minWidth: 240,
      maxWidth: 280,
      flexShrink: 0,
      background: "rgba(255,255,255,0.03)",
      borderRadius: T.radiusSm,
      border: `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      maxHeight: "100%",
    }}>
      {/* Column header */}
      <div style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        {editingHeader ? (
          <input
            autoFocus
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            onBlur={saveHeader}
            onKeyDown={(e) => { if (e.key === "Enter") saveHeader(); }}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: textColor, fontSize: 14, fontWeight: 600, fontFamily: T.font, padding: 0,
            }}
          />
        ) : (
          <button
            onClick={() => { setHeaderText(column.t); setEditingHeader(true); }}
            style={{
              flex: 1, background: "none", border: "none", textAlign: "left",
              color: textColor, fontSize: 14, fontWeight: 600, fontFamily: T.font,
              cursor: "pointer", padding: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {column.t || "Untitled"}
          </button>
        )}
        <span style={{ fontSize: 11, color: T.textDim, flexShrink: 0 }}>
          {column.ch.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        {column.ch.map((card) => (
          <div key={card.id}>
            <div
              onClick={() => onZoom(card.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${T.border}`,
                cursor: "pointer",
                transition: "background 0.12s",
              }}
            >
              <div style={{
                fontSize: 13, color: textColor, fontFamily: T.font,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                textDecoration: card.done ? "line-through" : "none",
                opacity: card.done ? 0.5 : 1,
              }}>
                {card.t || "Untitled"}
              </div>
              {/* Card metadata */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {card.type && (() => {
                  const nt = NODE_TYPES.find((t) => t.id === card.type);
                  return nt ? <span style={{ fontSize: 9, color: nt.color, fontWeight: 600 }}>{nt.icon}{card.done ? "✓" : ""}</span> : null;
                })()}
                {card.star && <span style={{ fontSize: 9, color: "#FFD740" }}>★</span>}
                {card.pri && <span style={{ fontSize: 9, color: PRI_COLORS[card.pri], fontWeight: 700 }}>{PRI_LABELS[card.pri]}</span>}
                {card.hl && <span style={{ width: 6, height: 6, borderRadius: "50%", background: card.hl }} />}
                {card.ch.length > 0 && (
                  <span style={{ fontSize: 9, color: T.textDim, marginLeft: "auto" }}>
                    {card.ch.length} sub
                  </span>
                )}
              </div>
              {/* Move button */}
              <button
                onClick={(e) => { e.stopPropagation(); setMoveCard(moveCard === card.id ? null : card.id); }}
                style={{
                  marginTop: 6, padding: "4px 8px", borderRadius: 4,
                  background: moveCard === card.id ? `${accentColor}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${moveCard === card.id ? accentColor : "transparent"}`,
                  color: moveCard === card.id ? accentColor : T.textDim,
                  fontSize: 10, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15" /><polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                Move
              </button>
            </div>

            {/* Move target selector */}
            {moveCard === card.id && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "6px 0" }}>
                {visibleRootNodes.filter((c) => c.id !== column.id).map((targetCol) => (
                  <button
                    key={targetCol.id}
                    onClick={() => handleMoveCard(card.id, targetCol.id)}
                    style={{
                      padding: "5px 10px", borderRadius: 4,
                      background: `${accentColor}14`, border: `1px solid ${accentColor}44`,
                      color: accentColor, fontSize: 11, fontWeight: 600,
                      fontFamily: T.font, cursor: "pointer",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: 120,
                    }}
                  >
                    → {targetCol.t || "Untitled"}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {column.ch.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: T.textFaint, fontSize: 12, fontFamily: T.font }}>
            No items
          </div>
        )}
      </div>
    </div>
  );
}

export default BoardColumn;
