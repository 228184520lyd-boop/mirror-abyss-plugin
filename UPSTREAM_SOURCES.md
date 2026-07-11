# Upstream Sources and Design References

Mirror Abyss is an independent implementation. The following projects and documents were reviewed for architecture and interoperability patterns:

- SillyTavern UI Extensions documentation
  - lifecycle hooks and `APP_READY`
  - `renderExtensionTemplateAsync`
  - `extensionSettings`, `chatMetadata` and `localforage`
  - events, `generateRaw`, JSON Schema and Prompt Interceptors
- SillyTavern official interceptor extensions
  - global `generate_interceptor` registration and abort behavior
- Recast Post-Processing
  - independent post-processing passes, Connection Profiles and in-place final output replacement
- Stepped Thinking
  - bounded multi-step generation and per-step model selection
- st-memory-enhancement
  - structured editable table workflow and configurable schemas
- SillyTavern Memory Books
  - memory task states, multi-tier consolidation and lorebook publication
- SillyTavern Message Summarize
  - message-bound memory and edit/delete consistency
- CharMemory
  - health diagnostics, storage/publication separation and mobile dashboard patterns

No source code, prompts, CSS, icons, screenshots, or visual assets from these projects are copied into Mirror Abyss.
