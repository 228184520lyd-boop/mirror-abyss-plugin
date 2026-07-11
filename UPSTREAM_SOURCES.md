# Upstream Sources and Design References

Mirror Abyss is an independent implementation. The following projects and documents were reviewed for architecture and interoperability patterns:

- SillyTavern UI Extensions documentation
  - lifecycle hooks and APP_READY
  - renderExtensionTemplateAsync
  - extensionSettings, chatMetadata and localforage
  - events and generateRaw
- SillyTavern Extension React/Webpack template
  - source/build separation and distributable bundle
- st-memory-enhancement
  - structured editable table workflow and configurable schemas
- SillyTavern Memory Books
  - memory task states, multi-tier consolidation and lorebook publication
- SillyTavern Message Summarize
  - message-bound memory and edit/delete consistency
- CharMemory
  - setup/health diagnostics, storage/publication separation, single LLM dispatch and mobile dashboard patterns

No source code, prompts, CSS, icons, or visual assets from these projects are copied into Mirror Abyss.
