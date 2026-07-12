# Third-Party Notices

Mirror Abyss 1.1.0-alpha.9.6 does not bundle third-party runtime libraries.

The production bundle is generated from this repository's TypeScript source using esbuild. Development-only dependencies include TypeScript, tsx, esbuild, happy-dom, ESLint, `@eslint/js`, `globals`, and `typescript-eslint`. They are not required by SillyTavern at runtime; their license metadata remains in the npm packages and lockfile.

SillyTavern provides runtime extension lifecycle hooks, account-scoped storage, chat metadata, World Info server endpoints, generation services, Connection Manager services, backend proxy endpoints, event services, and the same-origin browser environment. Mirror Abyss accesses these through public host interfaces.

The cross-tab coordinator independently implements the public Web Locks API contract, with an advisory localStorage fallback and BroadcastChannel notifications. No browser-standard implementation or nonessential specification prose is bundled.

Memory Books and Qvink Message Summarize were studied as AGPL-3.0 architecture/behavior references. Their source code, prompts, CSS, assets, page structure, and product naming are not redistributed. Amily2 remains a restricted behavior-only reference and is excluded from the code supply chain.

The user-provided Mirror Abyss alpha.6 and alpha.7 deployment source maps were inspected as this project's own migration and compatibility baseline. References and decisions are recorded in `UPSTREAM_SOURCES.md`, `research/inventory.md`, and `research/license-matrix.md`.
