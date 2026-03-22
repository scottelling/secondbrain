// ─── Format Converters ───────────────────────────────────────

// Convert selected nodes to indented text for clipboard
export function nodesToText(nodes, selectedIds, depth = 0) {
  let text = "";
  for (const n of nodes) {
    if (selectedIds.has(n.id)) {
      text += "  ".repeat(depth) + "- " + n.t + "\n";
      // Include all children regardless of selection
      for (const ch of n.ch) {
        text += nodesToTextAll(ch, depth + 1);
      }
    } else {
      text += nodesToText(n.ch, selectedIds, depth);
    }
  }
  return text;
}

export function nodesToTextAll(node, depth) {
  let text = "  ".repeat(depth) + "- " + node.t + "\n";
  for (const ch of node.ch) text += nodesToTextAll(ch, depth + 1);
  return text;
}

// Plain text (indented bullets)
export function toPlainText(nodes, depth = 0) {
  let text = "";
  for (const n of nodes) {
    if (n.t) text += "  ".repeat(depth) + "- " + n.t + "\n";
    if (n.ch.length) text += toPlainText(n.ch, depth + 1);
  }
  return text;
}

// Markdown (headings for top-level, bullets for nested)
export function toMarkdown(nodes, depth = 0) {
  let md = "";
  for (const n of nodes) {
    if (!n.t && !n.ch.length) continue;
    if (depth === 0) {
      md += `## ${n.t}\n\n`;
    } else if (depth === 1) {
      md += `- **${n.t}**\n`;
    } else {
      md += "  ".repeat(depth - 1) + `- ${n.t}\n`;
    }
    if (n.ch.length) md += toMarkdown(n.ch, depth + 1);
    if (depth === 0) md += "\n";
  }
  return md;
}

// JSON export
export function toJSON(nodes) {
  return JSON.stringify(nodes, null, 2);
}

// OPML export
export function toOPML(nodes, title = "Second Brain") {
  const escXml = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function renderOutline(nodes) {
    let xml = "";
    for (const n of nodes) {
      xml += `<outline text="${escXml(n.t)}"`;
      if (n.ch.length) {
        xml += `>\n${renderOutline(n.ch)}</outline>\n`;
      } else {
        xml += "/>\n";
      }
    }
    return xml;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>${escXml(title)}</title></head>\n<body>\n${renderOutline(nodes)}</body>\n</opml>`;
}
