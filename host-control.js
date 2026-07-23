export function resolveHostControl(settings) {
    const managed = Boolean(settings.enabled && settings.hostControl?.enabled !== false);
    return {
        managed,
        audit: Boolean(managed && settings.auditEnabled),
        lorebook: Boolean(managed && settings.lorebookSync),
        vector: Boolean(managed && settings.hostControl?.vector !== false),
        recursion: Boolean(managed && settings.hostControl?.recursion !== false),
    };
}
