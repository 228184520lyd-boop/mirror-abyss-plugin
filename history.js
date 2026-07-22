export function firstInconsistentArtifactIndex(chat, moduleName, identityAt, fingerprintAt) {
    return chat.findIndex((message, index) => {
        const artifact = message?.extra?.[moduleName];
        return Boolean(artifact &&
            (artifact.messageIndex !== index ||
                artifact.messageKey !== identityAt(index) ||
                artifact.sourceFingerprint !== fingerprintAt(index)));
    });
}
//# sourceMappingURL=history.js.map