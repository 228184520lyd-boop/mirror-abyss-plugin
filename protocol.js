import { EXTRACTION_TYPES, FACT_PROTOCOL, SUMMARY_PROTOCOL, WORLD_TYPES, hasSection, hasType } from './schema.js';
import { fault, normalizeIdentity, unique } from './util.js';

const FACT_LINE = /^事实｜([^｜]+)｜([^｜]+)｜([^｜]+)｜(建立|变化|结束)｜([^｜]*)｜(.+)$/u;
const SUMMARY_LINE = /^整理｜([^｜]+)｜([^｜]+)｜([^｜]+)｜([^｜]+)｜(.+)$/u;

function cleanOutput(raw) {
  return String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/giu, '').replace(/```(?:\w+)?/gu, '').trim();
}

function linesOf(raw) {
  const text = cleanOutput(raw);
  if (!text) throw fault('protocol', 'EMPTY_OUTPUT', '模型没有返回最终协议');
  if (text === '无') return [];
  return text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
}

export function parseFactProtocol(raw, options = {}) {
  const allowedTypes = options.allowedTypes ?? EXTRACTION_TYPES;
  const lines = linesOf(raw);
  const groups = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(FACT_LINE);
    if (!match) throw fault('protocol', 'FACT_LINE', `第${index + 1}行不符合协议：${FACT_PROTOCOL}`);
    const [, type, rawName, section, change, relationText, rawFact] = match;
    const name = rawName.trim();
    const fact = rawFact.trim();
    if (!hasType(type, allowedTypes)) throw fault('protocol', 'TYPE', `第${index + 1}行类型“${type}”不在本任务模板中`);
    if (!name || name.length > 80 || /[\r\n｜]/u.test(name)) throw fault('protocol', 'IDENTITY', `第${index + 1}行稳定名称不合法`);
    if (!hasSection(type, section)) throw fault('protocol', 'SECTION', `第${index + 1}行栏目“${section}”不属于${type}模板`);
    if (!fact) throw fault('protocol', 'FACT', `第${index + 1}行缺少完整事实`);
    const key = normalizeIdentity(`${type}｜${name}`);
    const group = groups.get(key) ?? { type, name, title: `${type}｜${name}`, rows: [] };
    group.rows.push({ section, change, relations: unique(relationText.split('、')), fact });
    groups.set(key, group);
  }
  const result = [...groups.values()];
  const limit = Number(options.maxIdentities ?? 32);
  if (result.length > limit) throw fault('protocol', 'LIMIT', `本次候选对象超过${limit}个上限`);
  return result;
}

export function parseSummaryProtocol(raw, sources, options = {}) {
  const lines = linesOf(raw);
  if (!lines.length) {
    if (options.allowNone === true) return [];
    throw fault('protocol', 'MANUAL_EMPTY', '人工合并必须返回整理结果');
  }
  const sourceByRef = new Map((sources ?? []).map((entry, index) => [`条目${index + 1}`, entry]));
  const claimed = new Set();
  const groups = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(SUMMARY_LINE);
    if (!match) throw fault('protocol', 'SUMMARY_LINE', `第${index + 1}行不符合协议：${SUMMARY_PROTOCOL}`);
    const refs = unique(match[1].split(/[、,，]/u));
    const type = match[2].trim();
    const name = match[3].trim();
    const section = match[4].trim();
    const fact = match[5].trim();
    if (!refs.length || refs.some(ref => !sourceByRef.has(ref))) throw fault('protocol', 'SOURCE_REF', `第${index + 1}行引用了本批以外的条目编号`);
    if (!hasType(type, WORLD_TYPES) || !hasSection(type, section)) throw fault('protocol', 'SUMMARY_SCHEMA', `第${index + 1}行类型或栏目不属于模板`);
    if (!name || !fact) throw fault('protocol', 'SUMMARY_FACT', `第${index + 1}行缺少稳定名称或完整事实`);
    const groupKey = `${refs.slice().sort().join('、')}\u0000${normalizeIdentity(`${type}｜${name}`)}`;
    const group = groups.get(groupKey) ?? { refs, type, name, title: `${type}｜${name}`, sections: new Map() };
    const facts = group.sections.get(section) ?? [];
    group.sections.set(section, unique([...facts, fact]));
    groups.set(groupKey, group);
  }
  const targetOwners = new Set();
  for (const group of groups.values()) {
    const target = normalizeIdentity(`${group.type}｜${group.name}`);
    if (targetOwners.has(target)) throw fault('protocol', 'TARGET_DUPLICATE', `整理目标“${group.title}”被拆成了多个来源组`);
    targetOwners.add(target);
    for (const ref of group.refs) {
      if (claimed.has(ref)) throw fault('protocol', 'SOURCE_DUPLICATE', `临时条目编号“${ref}”被多个整理结果重复使用`);
      claimed.add(ref);
    }
  }
  return [...groups.values()];
}

export function parseAuditProtocol(raw) {
  const text = cleanOutput(raw);
  if (text === '审核结论：通过') return { passed: true, issues: [] };
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines[0] !== '审核结论：需要修正') throw fault('protocol', 'AUDIT_RESULT', '审核模型没有返回固定结论');
  const issues = lines.slice(1).map(line => line.replace(/^[-•]\s*/u, '').replace(/^问题[：:]\s*/u, '')).filter(Boolean);
  if (!issues.length) throw fault('protocol', 'AUDIT_ISSUES', '审核结论要求修正，但没有给出明确问题');
  return { passed: false, issues };
}
