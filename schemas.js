/* Generated from src/features/processing/schemas.ts for esm.sh — do not edit dist directly. */
import { z } from 'https://esm.sh/zod@4.4.3?target=es2022';
export const AuditResultSchema = z.object({
    passed: z.boolean(),
    decision: z.enum(['pass', 'revise', 'block']),
    reason: z.string(),
    violations: z.array(z.object({
        ruleId: z.string(),
        rule: z.string(),
        evidence: z.string(),
        action: z.string(),
    })),
    preserve: z.array(z.string()),
    rewriteInstruction: z.string(),
    replacementText: z.string().optional(),
});
export const RevisionResultSchema = z.object({
    text: z.string().min(1),
    appliedContentHash: z.string().optional(),
});
export const ExtractionResultSchema = z.object({
    turnSummary: z.string(),
    facts: z.array(z.object({
        eventName: z.string(),
        tableKey: z.string(),
        objectName: z.string(),
        semanticLayer: z.string(),
        fact: z.string(),
    })),
    appliedContentHash: z.string().optional(),
    protocolVersion: z.string().optional(),
});
