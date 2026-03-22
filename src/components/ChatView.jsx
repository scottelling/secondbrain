import { useState, useRef, useEffect, useCallback } from 'react';
import { T } from '../lib/tokens';
import { NODE_TYPES } from '../lib/nodes';

function ChatView({ nodes, chatQueue, setChatQueue, chatMessages, setChatMessages, chatInput, setChatInput, chatLoading, setChatLoading, settings, accentColor, textColor, showToast, getNode }) {
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Collect node context (text + children summary)
  const getNodeContext = useCallback((nodeId) => {
    const node = getNode(nodeId);
    if (!node) return "";
    let ctx = node.t;
    if (node.note) ctx += `\nNote: ${node.note}`;
    if (node.type) ctx += `\nType: ${node.type}`;
    if (node.tags?.length) ctx += `\nTags: ${node.tags.map((t) => `#${t}`).join(" ")}`;
    if (node.pri) ctx += `\nPriority: ${node.pri}`;
    if (node.ch.length > 0) {
      ctx += "\nSub-items:";
      const walkChildren = (children, depth) => {
        for (const ch of children) {
          ctx += `\n${"  ".repeat(depth)}- ${ch.t}`;
          if (ch.ch.length > 0 && depth < 2) walkChildren(ch.ch, depth + 1);
        }
      };
      walkChildren(node.ch, 1);
    }
    return ctx;
  }, [getNode]);

  // Send a queued item to the input as context
  const seedFromQueue = useCallback((nodeId) => {
    const ctx = getNodeContext(nodeId);
    if (ctx) {
      setChatInput((prev) => prev + (prev ? "\n\n" : "") + `> ${ctx}`);
    }
    setChatQueue((prev) => prev.filter((id) => id !== nodeId));
    setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
    }, 100);
  }, [getNodeContext, setChatInput, setChatQueue]);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const headers = { "Content-Type": "application/json" };
      if (settings.apiKey) headers["x-api-key"] = settings.apiKey;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.aiModel || "claude-sonnet-4-6",
          max_tokens: 1000,
          system: "You are a helpful thinking partner embedded in an outliner app called Second Brain. Keep responses concise and actionable. Use short paragraphs, not bullet lists. The user may send you notes, ideas, tasks, or research items from their outliner for you to help with.",
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const assistantText = data.content?.map((c) => c.text || "").join("") || "Sorry, I couldn't generate a response.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}. Make sure you're connected to the internet.` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatLoading, setChatInput, setChatMessages, setChatLoading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Queue tray */}
      {chatQueue.length > 0 && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: T.font }}>
            Queued ({chatQueue.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {chatQueue.map((nodeId) => {
              const node = getNode(nodeId);
              if (!node) return null;
              const nt = NODE_TYPES.find((t) => t.id === node.type);
              return (
                <div
                  key={nodeId}
                  onClick={() => seedFromQueue(nodeId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${T.border}`,
                    cursor: "pointer",
                  }}
                >
                  {nt && <span style={{ fontSize: 12, color: nt.color }}>{nt.icon}</span>}
                  <span style={{ flex: 1, fontSize: 13, color: textColor, fontFamily: T.font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {node.t || "Untitled"}
                  </span>
                  <span style={{ fontSize: 10, color: accentColor, fontWeight: 600, fontFamily: T.font, flexShrink: 0 }}>
                    Tap to process →
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {chatMessages.length === 0 && chatQueue.length === 0 && (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
            <div style={{ fontSize: 15, color: T.textDim, fontFamily: T.font, marginBottom: 4 }}>AI Chat</div>
            <div style={{ fontSize: 12, color: T.textFaint, fontFamily: T.font }}>Swipe a bullet → AI Chat to queue items here, or just start typing</div>
          </div>
        )}

        {chatMessages.length === 0 && chatQueue.length > 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: T.textDim, fontFamily: T.font }}>Tap a queued item above to start a conversation about it</div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}
          >
            <div style={{
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? `${accentColor}20` : "rgba(255,255,255,0.06)",
              border: `1px solid ${msg.role === "user" ? `${accentColor}30` : T.border}`,
            }}>
              <div style={{
                fontSize: 13, color: textColor, fontFamily: T.font,
                lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {chatLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div style={{
              padding: "12px 18px", borderRadius: "16px 16px 16px 4px",
              background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
            }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map((d) => (
                  <div key={d} style={{
                    width: 6, height: 6, borderRadius: "50%", background: T.textDim,
                    animation: `bounce 1.2s infinite ${d * 0.15}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: "10px 12px", borderTop: `1px solid ${T.border}`,
        background: settings.bgColor, flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 0,
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: "4px 4px 4px 14px",
        }}>
          <textarea
            ref={inputRef}
            value={chatInput}
            onChange={(e) => { setChatInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            placeholder="Type a message..."
            rows={1}
            style={{
              flex: 1, padding: "8px 0",
              background: "none", border: "none",
              color: textColor, fontSize: 14, fontFamily: T.font, outline: "none",
              resize: "none", minHeight: 24, maxHeight: 120,
              lineHeight: 1.4,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={chatLoading || !chatInput.trim()}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: chatInput.trim() && !chatLoading ? accentColor : "transparent",
              border: "none", cursor: chatInput.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s", marginBottom: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim() && !chatLoading ? settings.bgColor : T.textFaint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatView;
