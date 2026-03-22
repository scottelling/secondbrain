// ─── Tree Operations ─────────────────────────────────────────

// Find a node and its location in the tree
export function findInTree(nodes, id, parent = null) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { node: nodes[i], parent, index: i, siblings: nodes };
    const found = findInTree(nodes[i].ch, id, nodes[i], i);
    if (found) return found;
  }
  return null;
}

// Get a node by id
export function getNode(nodes, id) {
  const f = findInTree(nodes, id);
  return f ? f.node : null;
}

// Remove a node from tree, return { tree, removed }
export function removeFromTree(nodes, id) {
  const result = [];
  let removed = null;
  for (const n of nodes) {
    if (n.id === id) {
      removed = n;
    } else {
      const sub = removeFromTree(n.ch, id);
      if (sub.removed) removed = sub.removed;
      result.push({ ...n, ch: sub.tree });
    }
  }
  return { tree: result, removed };
}

// Insert a node after targetId at the same level
export function insertAfterInTree(nodes, targetId, newNode) {
  const result = [];
  for (const n of nodes) {
    result.push({ ...n, ch: insertAfterInTree(n.ch, targetId, newNode) });
    if (n.id === targetId) result.push(newNode);
  }
  return result;
}

// Insert a node as the last child of parentId
export function insertAsChild(nodes, parentId, newNode) {
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, ch: [...n.ch, newNode], col: false }
      : { ...n, ch: insertAsChild(n.ch, parentId, newNode) }
  );
}

// Insert a node before targetId at the same level
export function insertBeforeInTree(nodes, targetId, newNode) {
  const result = [];
  for (const n of nodes) {
    if (n.id === targetId) result.push(newNode);
    result.push({ ...n, ch: insertBeforeInTree(n.ch, targetId, newNode) });
  }
  return result;
}

// Update a node's text
export function updateText(nodes, id, text) {
  return nodes.map((n) =>
    n.id === id ? { ...n, t: text } : { ...n, ch: updateText(n.ch, id, text) }
  );
}

// Toggle collapsed
export function toggleCollapse(nodes, id) {
  return nodes.map((n) =>
    n.id === id ? { ...n, col: !n.col } : { ...n, ch: toggleCollapse(n.ch, id) }
  );
}

// Update any property on a node
export function updateNodeProp(nodes, id, key, value) {
  return nodes.map((n) =>
    n.id === id ? { ...n, [key]: value } : { ...n, ch: updateNodeProp(n.ch, id, key, value) }
  );
}

// Flatten tree into visible list with depth info
export function flattenVisible(nodes, depth = 0) {
  const result = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    result.push({ node: n, depth, index: i });
    if (n.ch.length > 0 && !n.col) {
      result.push(...flattenVisible(n.ch, depth + 1));
    }
  }
  return result;
}

// Flatten ALL nodes in tree (ignores collapse)
export function flattenAll(nodes, depth = 0) {
  const result = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    result.push({ node: n, depth, index: i });
    if (n.ch.length > 0) {
      result.push(...flattenAll(n.ch, depth + 1));
    }
  }
  return result;
}

// Filter nodes matching search/filter criteria
export function matchesFilter(node, query, filters) {
  let pass = true;
  if (query) {
    pass = pass && node.t.toLowerCase().includes(query.toLowerCase());
  }
  if (filters.star) {
    pass = pass && node.star;
  }
  if (filters.pri) {
    pass = pass && node.pri === filters.pri;
  }
  if (filters.hl) {
    pass = pass && node.hl === filters.hl;
  }
  if (filters.tag) {
    pass = pass && node.tags?.includes(filters.tag);
  }
  if (filters.todo) {
    pass = pass && (node.type === "task" || node.type === "recurring");
    if (filters.todo === "done") pass = pass && node.done;
    if (filters.todo === "todo") pass = pass && !node.done;
  }
  if (filters.type) {
    pass = pass && node.type === filters.type;
  }
  return pass;
}

// Get the previous visible node in flat order
export function getPrevVisible(flat, id) {
  const idx = flat.findIndex((f) => f.node.id === id);
  return idx > 0 ? flat[idx - 1].node : null;
}

// Get the next visible node in flat order
export function getNextVisible(flat, id) {
  const idx = flat.findIndex((f) => f.node.id === id);
  return idx >= 0 && idx < flat.length - 1 ? flat[idx + 1].node : null;
}

// Build breadcrumb path from root to zoomId
export function buildBreadcrumbs(nodes, zoomStack) {
  const crumbs = [{ id: "__root__", label: "\uD83E\uDDE0" }];
  let current = nodes;
  for (const zid of zoomStack) {
    const found = findInTree(current, zid);
    if (!found) break;
    crumbs.push({ id: zid, label: found.node.t || "Untitled" });
    current = found.node.ch;
  }
  return crumbs;
}

// Get the visible root nodes based on zoom
export function getZoomedNodes(nodes, zoomStack) {
  let current = nodes;
  for (const zid of zoomStack) {
    const found = findInTree(current, zid);
    if (found) {
      current = found.node.ch;
    } else {
      break;
    }
  }
  return current;
}

// Collect all IDs in a subtree
export function collectIds(node) {
  const ids = [node.id];
  for (const ch of node.ch) ids.push(...collectIds(ch));
  return ids;
}
