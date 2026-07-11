# Upstream Sources

| Project | Repository | License | Use in Mirror Abyss |
|---|---|---|---|
| SillyTavern | https://github.com/SillyTavern/SillyTavern | AGPL-3.0 | Extension context, events, message data, chat metadata, World Info module interfaces |
| Memory Books | https://github.com/aikohanasaki/SillyTavern-MemoryBooks | AGPL-3.0 | Mature lorebook CRUD/sync and summary task architecture reference |
| Lorebook Studio | https://github.com/hype-hosting/SillyTavern-Lorebook-Studio | AGPL-3.0 | 3D graph workspace, mobile interaction and lorebook editing architecture reference |
| MessageSummarize | https://github.com/qvink/SillyTavern-MessageSummarize | AGPL-3.0 | Message-attached derived-memory lifecycle reference |
| WTracker | https://github.com/bmen25124/SillyTavern-WTracker | MIT | Structured tracker/schema and editing reference |
| 3d-force-graph | https://github.com/vasturiano/3d-force-graph | MIT | Runtime 3D graph renderer |

## Non-code behavioral reference

Amily2 (`Wx-2025/ST-Amily2-Chat-Optimisation`) was used only to study where a compact, collapsible table is comfortable in the chat flow. No Amily2 code, styling, icons, or assets are included.

## Mirror Abyss original layer

The following behavior is specific to this project:

- Eight-table Mirror Abyss state schema.
- Mixed calculation of current snapshot + player input + AI response.
- Snapshot-style small summary by valid state turns.
- Large summary by existing small-summary count.
- Shared message lifecycle and irreversible deletion semantics.
- Table/summary-to-lorebook compilation policy.
- Legacy Mirror Abyss card and lorebook migration.
