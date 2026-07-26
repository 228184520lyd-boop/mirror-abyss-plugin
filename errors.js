/* Generated from src/shared/errors.ts for esm.sh — do not edit dist directly. */
/** 统一错误对象，供 UI 显示 stage、chatKey 与 messageKey。 */
export class MirrorAbyssError extends Error {
    code;
    stage;
    cause;
    constructor(code, message, stage, cause) {
        super(message);
        this.code = code;
        this.stage = stage;
        this.cause = cause;
        this.name = 'MirrorAbyssError';
    }
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
