/**
 * 模块职责：提供事实、快照与世界书发布共用的纯旁观判定。
 * 维护边界：含旁观措辞但产生明确因果介入时必须保留；否定介入不能被误判为介入。
 */
const PASSIVE_OBSERVER = /(纯观众|旁观|围观|观众|看客|路人|背景人物|未介入|只听见|喝彩|起哄|议论|人群反应|站在一旁|远处观看|观战)/i;
const CAUSAL_INTERVENTION = /(介入|出手|攻击|阻止|救援|治疗|打断|干预|加入战斗|改变战局|扭转|导致|造成|夺取|提供关键|发动|施放|控制|拦截|保护|击中|受伤|伤害|死亡|被俘)/i;
const NEGATED_INTERVENTION = /(?:未|没有|并未|从未|不曾)\s*(?:介入|出手|攻击|阻止|救援|治疗|打断|干预|加入战斗|改变战局|扭转|导致|造成|夺取|提供关键|发动|施放|控制|拦截|保护|击中|受伤|伤害)/gi;
export function isPurePassiveObserverText(value) {
    const text = String(value ?? '');
    if (!PASSIVE_OBSERVER.test(text))
        return false;
    const affirmativeText = text.replace(NEGATED_INTERVENTION, '');
    return !CAUSAL_INTERVENTION.test(affirmativeText);
}
