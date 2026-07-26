/* Generated from src/shared/hash.ts for esm.sh — do not edit dist directly. */
/**
 * 非密码学稳定哈希。只用于消息内容、提示词版本和事实键去重。
 * FACT-DATA-003：哈希相同才允许复用阶段结果；它不承担安全用途。
 */
export function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
export function normalizedIdentity(value) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s·•._—–\-|｜:：()（）【】\[\]<>《》“”"'`]+/gu, '');
}
