const defineType = (icon, sections, options = {}) => Object.freeze({
  icon,
  constant: options.constant === true,
  sections: Object.freeze(Object.fromEntries(sections.map(([name, policy]) => [name, policy]))),
});

/**
 * 世界书栏目唯一来源。
 * 提示词、协议校验、正文合并和界面均直接读取本对象，不各自维护栏目副本。
 */
export const WORLD_SCHEMA = Object.freeze({
  人物: defineType('人', [['身份', 'append'], ['经历', 'append'], ['当前状态', 'replace']]),
  场景: defineType('景', [['位置', 'append'], ['状态', 'replace'], ['场景阶段', 'replace']]),
  物品: defineType('物', [['来源', 'append'], ['状态', 'replace'], ['所属关系', 'replace']]),
  事件: defineType('事', [['事件过程', 'append'], ['事件结果', 'replace'], ['影响', 'append']]),
  世界: defineType('界', [['世界规则', 'append'], ['环境状态', 'replace'], ['长期变化', 'append']]),
  基础设定: defineType('基', [
    ['世界常识', 'append'], ['自然规则', 'append'], ['种族与生命', 'append'],
    ['能力与技术', 'append'], ['社会规则', 'append'], ['地理框架', 'append'], ['别名', 'append'],
  ], { constant: true }),
});

export const WORLD_TYPES = Object.freeze(Object.keys(WORLD_SCHEMA));
export const EXTRACTION_TYPES = Object.freeze(WORLD_TYPES.filter(type => type !== '基础设定'));

export function hasType(type, allowedTypes = WORLD_TYPES) {
  return allowedTypes.includes(String(type ?? '').trim());
}

export function hasSection(type, section) {
  return Object.hasOwn(WORLD_SCHEMA[String(type ?? '')]?.sections ?? {}, String(section ?? '').trim());
}

export function sectionNames(type) {
  return Object.keys(WORLD_SCHEMA[String(type ?? '')]?.sections ?? {});
}

export function sectionPolicy(type, section) {
  return WORLD_SCHEMA[String(type ?? '')]?.sections?.[String(section ?? '').trim()] ?? '';
}

export function renderSchema(types = WORLD_TYPES) {
  return types.map(type => `${type}：${sectionNames(type).join('、')}`).join('\n');
}

export const FACT_PROTOCOL = '事实｜类型｜稳定名称｜栏目｜建立/变化/结束｜关联对象｜完整事实';
export const SUMMARY_PROTOCOL = '整理｜条目编号（可多个）｜类型｜稳定名称｜栏目｜完整事实';
