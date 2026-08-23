import { WORLD_SCHEMA, WORLD_TYPES, hasSection, sectionNames, sectionPolicy } from './schema.js';
import { invariant, normalizeIdentity, unique } from './util.js';

const ensureEntry = (condition, message, code = 'LORE_ITEM') => invariant(condition, message, 'protocol', code);

const TITLE = /^(人物|场景|物品|事件|世界|基础设定)｜([^｜\r\n]+)$/u;
const HEADING = /^【([^】]+)】$/u;
const FACT = /^-\s+(.+)$/u;

export function parseManagedTitle(value) {
  const match = String(value ?? '').trim().match(TITLE);
  return match ? { type: match[1], name: match[2].trim(), title: `${match[1]}｜${match[2].trim()}` } : null;
}

export function identityKey(type, name) {
  return normalizeIdentity(`${type}｜${name}`);
}

export function parseSections(content, type) {
  const values = new Map();
  let current = '';
  for (const rawLine of String(content ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(HEADING)?.[1]?.trim();
    if (heading) {
      ensureEntry(hasSection(type, heading), `栏目“${heading}”不属于${type}模板`, 'LORE_SECTION');
      ensureEntry(!values.has(heading), `栏目“${heading}”重复出现`, 'LORE_SECTION_DUPLICATE');
      current = heading;
      values.set(current, []);
      continue;
    }
    const fact = line.match(FACT)?.[1]?.trim();
    ensureEntry(current && fact, '正文必须由“【栏目】”和“- 完整事实”组成', 'LORE_LINE');
    values.get(current).push(fact);
  }
  for (const [section, facts] of values) ensureEntry(facts.length > 0, `栏目“${section}”没有事实`, 'LORE_EMPTY_SECTION');
  return values;
}

export function serializeSections(type, sections) {
  const lines = [];
  for (const section of sectionNames(type)) {
    const facts = unique(sections.get(section));
    if (!facts.length) continue;
    lines.push(`【${section}】`, ...facts.map(fact => `- ${fact}`), '');
  }
  return lines.join('\n').trim();
}

export function mergeRows(type, currentSections, rows) {
  const merged = new Map([...currentSections].map(([section, facts]) => [section, [...facts]]));
  for (const row of rows) {
    const facts = merged.get(row.section) ?? [];
    if (sectionPolicy(type, row.section) === 'replace') merged.set(row.section, [row.fact]);
    else merged.set(row.section, unique([...facts, row.fact]));
  }
  return merged;
}

export function parseManagedEntry(raw) {
  if (raw?.extensions?.mirrorAbyss?.managed !== true) return null;
  const title = parseManagedTitle(raw?.comment);
  ensureEntry(title, `UID ${raw?.uid ?? '未知'}缺少合法的类型与稳定名称`, 'LORE_TITLE');
  const sections = parseSections(raw?.content, title.type);
  return {
    uid: String(raw.uid),
    ...title,
    sections,
    content: serializeSections(title.type, sections),
    keywords: unique(raw.key),
    retired: raw?.extensions?.mirrorAbyss?.retired === true,
    raw,
  };
}

export function managedEntries(data) {
  const managed = [];
  const external = [];
  for (const raw of Object.values(data?.entries ?? {})) {
    const entry = parseManagedEntry(raw);
    if (entry) managed.push(entry);
    else external.push(raw);
  }
  return { managed, external };
}

export function assertUniqueManagedIdentities(data) {
  const seen = new Map();
  for (const entry of managedEntries(data).managed.filter(entry => !entry.retired)) {
    const key = identityKey(entry.type, entry.name);
    ensureEntry(!seen.has(key), `世界书存在重复管理身份：${entry.title}（UID ${seen.get(key)}、${entry.uid}）`, 'IDENTITY_DUPLICATE');
    seen.set(key, entry.uid);
  }
}

export function applyNativeEntryFields(raw, type, name, content, aliases = []) {
  ensureEntry(WORLD_TYPES.includes(type), `未知条目类型：${type}`, 'LORE_TYPE');
  raw.comment = `${type}｜${name}`;
  raw.content = content;
  raw.key = unique([name, ...aliases]);
  raw.keysecondary = [];
  raw.constant = WORLD_SCHEMA[type].constant;
  raw.disable = false;
  raw.vectorized = false;
  raw.selective = false;
  raw.excludeRecursion = false;
  raw.preventRecursion = false;
  raw.extensions ??= {};
  raw.extensions.mirrorAbyss = { managed: true, retired: false };
  return raw;
}
