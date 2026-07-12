# Third-Party Notices

Mirror Abyss 1.1.0-alpha.7 does not bundle third-party runtime libraries.

The production bundle is generated from this repository's TypeScript source using esbuild. Development-only dependencies are listed in `package.json` and are not required by SillyTavern at runtime.

SillyTavern provides runtime APIs, its backend proxy endpoints, ConnectionManagerRequestService, and shared browser libraries. Mirror Abyss accesses them through the public SillyTavern context and same-origin HTTP endpoints.

Other extensions were studied only as architectural references. Their code, prompts, CSS, icons, screenshots, and assets are not redistributed. Amily2's public independent API slot and SillyTavern backend-proxy request pattern, and Recast Post-Processing's profile-based post-processing workflow, were reviewed as behavior and architecture references. Mirror Abyss's source is independently written.
