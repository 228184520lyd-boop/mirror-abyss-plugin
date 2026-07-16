function nodeTypeFor(table) {
    if (table === "focus")
        return "focus";
    if (table === "characters")
        return "character";
    if (table === "items")
        return "item";
    if (table === "events")
        return "event";
    if (table === "regions" || table === "spacetime")
        return "region";
    return null;
}
function compactLabel(value) {
    const text = String(value || "").trim();
    return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}
function relationText(row) {
    return `${row.title}\n${row.content}\n${row.status}\n${row.keywords.join(" ")}`.toLowerCase();
}
function mentions(row, node) {
    const label = node.label.trim().toLowerCase();
    return label.length >= 2 && relationText(row).includes(label);
}
function uniquePairKey(a, b, label) {
    const [left, right] = [a, b].sort();
    return `${left}|${right}|${label}`;
}
export function buildRelationshipGraph(snapshot, scope = "relations") {
    if (!snapshot)
        return { nodes: [], edges: [] };
    const nodes = [];
    const nodeById = new Map();
    const rowsByNode = new Map();
    const tables = scope === "relations"
        ? ["focus", "characters"]
        : ["focus", "characters", "items", "events", "regions", "spacetime"];
    for (const table of tables) {
        const type = nodeTypeFor(table);
        if (!type)
            continue;
        for (const row of snapshot[table]) {
            const id = `${table}:${row.id}`;
            const node = {
                id,
                label: String(row.title || "未命名").trim(),
                type,
                detail: row.content,
                status: row.status,
                existence: row.lifecycle?.existence,
                activity: row.lifecycle?.activity,
                memory: row.lifecycle?.memory,
            };
            nodes.push(node);
            nodeById.set(id, node);
            rowsByNode.set(id, row);
        }
    }
    const edges = [];
    const seenEdges = new Set();
    let relationIndex = 0;
    for (const row of snapshot.relationships) {
        const matched = nodes.filter((node) => mentions(row, node));
        if (matched.length >= 2) {
            const source = matched[0];
            for (const target of matched.slice(1, 4)) {
                const key = uniquePairKey(source.id, target.id, row.title);
                if (seenEdges.has(key))
                    continue;
                seenEdges.add(key);
                edges.push({
                    id: `edge:${row.id}:${target.id}`,
                    source: source.id,
                    target: target.id,
                    label: compactLabel(row.title),
                    detail: row.content,
                });
            }
            continue;
        }
        const relationNode = {
            id: `relationship:${row.id}`,
            label: compactLabel(row.title || `关系${relationIndex + 1}`),
            type: "relationship",
            detail: row.content,
            status: row.status,
            existence: row.lifecycle?.existence,
            activity: row.lifecycle?.activity,
            memory: row.lifecycle?.memory,
        };
        relationIndex += 1;
        nodes.push(relationNode);
        nodeById.set(relationNode.id, relationNode);
        if (matched.length === 1) {
            edges.push({
                id: `edge:${row.id}:single`,
                source: matched[0].id,
                target: relationNode.id,
                label: compactLabel(row.status || "关系"),
                detail: row.content,
            });
        }
    }
    if (scope === "world") {
        const contextualTypes = new Set(["item", "event", "region"]);
        const characters = nodes.filter((node) => node.type === "character" || node.type === "focus");
        const contextual = nodes.filter((node) => contextualTypes.has(node.type));
        for (const character of characters) {
            const row = rowsByNode.get(character.id);
            if (!row)
                continue;
            const text = relationText(row);
            for (const target of contextual) {
                const label = target.label.toLowerCase();
                if (label.length < 2 || !text.includes(label))
                    continue;
                const key = uniquePairKey(character.id, target.id, "关联");
                if (seenEdges.has(key))
                    continue;
                seenEdges.add(key);
                edges.push({
                    id: `context:${character.id}:${target.id}`,
                    source: character.id,
                    target: target.id,
                    label: "关联",
                    detail: row.content,
                });
            }
        }
    }
    return { nodes, edges };
}
