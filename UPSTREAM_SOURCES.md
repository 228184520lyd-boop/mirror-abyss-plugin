# Upstream Sources and Design References

Mirror Abyss is an independent implementation. The following primary sources were reviewed for architecture and interoperability patterns:

- SillyTavern 1.14 source and UI extension documentation
  - `APP_READY`, extension settings, events, `generateRaw`
  - `ConnectionManagerRequestService.sendRequest()`
  - `getRequestHeaders()` and backend chat-completion proxy endpoints
  - world info, localforage, Prompt Interceptors and message update APIs
- Amily2 public repository
  - reusable API profile/slot assignment
  - direct use of SillyTavern backend proxy for OpenAI-compatible endpoints
  - separate model-list and generation requests
- Recast Post-Processing
  - stable Connection Profile IDs, bounded post-processing passes and in-place output replacement
- Stepped Thinking
  - bounded multi-step generation and per-step model selection
- st-memory-enhancement
  - editable structured tables
- SillyTavern Memory Books
  - task states, consolidation and lorebook publication
- SillyTavern Message Summarize
  - message-bound memory consistency
- CharMemory
  - diagnostics and storage/publication separation

No source code, prompts, CSS, icons, screenshots, or visual assets from these projects are copied into Mirror Abyss.
