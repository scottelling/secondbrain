function MarkdownNode({ node, depth, textColor, dimColor, accentColor }) {
  if (!node.t && !node.ch.length) return null;
  const metaRow = (node.star || node.pri || node.hl || node.tags?.length > 0) && (
    <span style={{ fontSize: 12, color: dimColor, marginLeft: 8 }}>
      {node.star && "★ "}
      {node.pri && ({ low: "! ", med: "!! ", high: "!!! " }[node.pri])}
      {node.tags?.map((t) => `#${t} `)}
    </span>
  );
  return (
    <div style={{ marginBottom: depth === 0 ? 16 : 4 }}>
      {depth === 0 ? (
        <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor, margin: "0 0 8px", borderBottom: `1px solid rgba(255,255,255,0.08)`, paddingBottom: 8 }}>
          {node.t}{metaRow}
        </h2>
      ) : depth === 1 ? (
        <div style={{ fontWeight: 600, color: textColor, marginBottom: 2 }}>
          {node.t}{metaRow}
        </div>
      ) : (
        <div style={{ color: textColor, paddingLeft: (depth - 1) * 16, position: "relative" }}>
          <span style={{ position: "absolute", left: (depth - 2) * 16, color: dimColor }}>•</span>
          {node.t}{metaRow}
        </div>
      )}
      {node.ch.length > 0 && (
        <div style={{ paddingLeft: depth === 0 ? 0 : 8 }}>
          {node.ch.map((ch) => (
            <MarkdownNode key={ch.id} node={ch} depth={depth + 1} textColor={textColor} dimColor={dimColor} accentColor={accentColor} />
          ))}
        </div>
      )}
    </div>
  );
}

export default MarkdownNode;
