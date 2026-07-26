/* Generated from src/model/settings.ts for esm.sh — do not edit dist directly. */
import { z } from 'https://esm.sh/zod@4.4.3?target=es2022';
export const SettingsSchema = z.object({
    enabled: z.boolean(),
    autoProcess: z.boolean(),
    auditEnabled: z.boolean(),
    autoRevision: z.boolean(),
    auditRules: z.string(),
    revisionInstructions: z.string(),
    requestTimeoutMs: z.number().int().min(10_000).max(300_000),
    auditResponseTokens: z.number().int().min(256).max(16_384),
    revisionResponseTokens: z.number().int().min(256).max(16_384),
    extractionResponseTokens: z.number().int().min(256).max(16_384),
});
export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    autoProcess: false,
    auditEnabled: false,
    autoRevision: true,
    auditRules: '',
    revisionInstructions: '',
    requestTimeoutMs: 90_000,
    auditResponseTokens: 4096,
    revisionResponseTokens: 4096,
    extractionResponseTokens: 4096,
});
export function parseSettings(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    return SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...candidate });
}
