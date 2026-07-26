/* Generated from src/shared/fixed-text.ts for jsDelivr +esm — do not edit dist directly. */
/**
 * 解析镜渊固定文本协议。允许“字段=值”和“字段：值”，不解析模型思考文本。
 * FACT-MODEL-002：边界适度宽容，但不会猜造缺失业务字段。
 */
export function parseBlocks(raw, markers) {
    const text = raw.replace(/\r/g, '');
    const blocks = [];
    for (const marker of markers) {
        let cursor = 0;
        while (cursor < text.length) {
            const start = text.indexOf(marker.start, cursor);
            if (start < 0)
                break;
            const bodyStart = start + marker.start.length;
            const end = text.indexOf(marker.end, bodyStart);
            if (end < 0)
                break;
            const body = text.slice(bodyStart, end).trim();
            const fields = new Map();
            for (const line of body.split('\n')) {
                const match = line.match(/^\s*([^=：:]+?)\s*(?:=|：|:)\s*(.*)\s*$/u);
                if (!match)
                    continue;
                const key = normalizeKey(match[1] ?? '');
                const value = (match[2] ?? '').trim();
                if (!key)
                    continue;
                const values = fields.get(key) ?? [];
                values.push(value);
                fields.set(key, values);
            }
            blocks.push({ kind: marker.kind, body, fields });
            cursor = end + marker.end.length;
        }
    }
    return blocks.sort((left, right) => raw.indexOf(left.body) - raw.indexOf(right.body));
}
export function field(block, ...keys) {
    for (const key of keys) {
        const values = block.fields.get(normalizeKey(key));
        if (values?.length)
            return values[0] ?? '';
    }
    return '';
}
export function fields(block, ...keys) {
    const output = [];
    for (const key of keys) {
        output.push(...(block.fields.get(normalizeKey(key)) ?? []));
    }
    return output;
}
export function normalizeKey(value) {
    return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}
