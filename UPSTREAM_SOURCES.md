# Upstream Sources and Design References

Mirror Abyss alpha.10.5.3 is an independent Foundation Correction built on SillyTavern public extension/server capabilities, browser standards, the existing Mirror Abyss foundation codebase, and project-owned alpha.6/alpha.7 migration evidence.

## Locked primary references

- `UPSTREAM-ST-TEMPLATE-001`
  - SillyTavern Extension Webpack Template
  - Repository: https://github.com/SillyTavern/Extension-WebpackTemplate
  - Revision: `c6e0863` (2026-03-17)
  - Use: source/build/distribution boundary and dependency-audit pattern
- `UPSTREAM-ST-CORE-002`
  - SillyTavern
  - Repository: https://github.com/SillyTavern/SillyTavern
  - Locked release: `1.18.0` (2026-05-03); release branch behavior rechecked 2026-07-12
  - Use: public extension lifecycle, World Info GET/edit endpoints, server atomic file replacement and same-origin runtime
- `STANDARD-WEBLOCKS-008`
  - W3C Web Locks API
  - Specification: https://w3c.github.io/web-locks/
  - Read: 2026-07-12
  - Use: exclusive same-origin resource-coordination semantics and AbortSignal boundary
- `STANDARD-BROADCAST-009`
  - WHATWG BroadcastChannel
  - Specification: https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts
  - Read: 2026-07-12
  - Use: same-origin notification and close lifecycle; not used as lock authority
- `STANDARD-WEBSTORAGE-010`
  - WHATWG Web Storage
  - Specification: https://html.spec.whatwg.org/multipage/webstorage.html
  - Read: 2026-07-12
  - Use: localStorage advisory-lease fallback
- `UPSTREAM-QMS-003`
  - Qvink Message Summarize
  - Repository: https://github.com/qvink/SillyTavern-MessageSummarize
  - Reference: public `master` implementation rechecked 2026-07-12; this correction does not assert an unverified commit SHA
  - Use: behavior references for chat metadata persistence, debounced saves, stop-after-abort and message-bound race acceptance tests
- `UPSTREAM-MB-004`
  - Memory Books
  - Repository: https://github.com/aikohanasaki/SillyTavern-MemoryBooks
  - Reference: public `main` implementation and manifest rechecked 2026-07-12; this correction does not assert an unverified commit SHA
  - Use: behavior references for persistent job states, cancellation/retry visibility and resource write lanes
- `MIRROR-ALPHA6-DEPLOY-011`
  - Mirror Abyss project-owned deployment/source map
  - Version: `1.1.0-alpha.6`
  - Use: old localforage database/store keys, settings, metadata and message extra migration evidence
- `MIRROR-ALPHA7-DEPLOY-007`
  - Mirror Abyss public deployment baseline
  - Version: `1.1.0-alpha.7`
  - Use: old chat-key formula, artifact/ChatState shape, worldbook ownership marker and in-place upgrade compatibility

## Restricted references

Amily2 public behavior was reviewed for API-slot and request-flow behavior only. Its source, modified source, CSS, DOM structure, prompts and assets are excluded from the Mirror Abyss code supply chain.

## Code provenance statement

No external extension source code, prompts, CSS, icons, screenshots or visual assets are copied into alpha.10.5.3. Cross-tab coordination, local commit recovery, migration, conflict UI and tests are independently written. Browser standards define API semantics; SillyTavern APIs are invoked as host interfaces. Exact records are in `research/inventory.md`, `research/license-matrix.md`, `research/architecture-comparison.md`, ADR files and `docs/REFERENCE_MATRIX.md`.
