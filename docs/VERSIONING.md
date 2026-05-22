# Versioning

FlowDocEditor uses project versions as release-readiness markers, not as a
promise that every internal behavior is stable.

The current baseline is `0.6.6`: suitable for self-use with accepted
`flow-row` / `flow-stack` static pagination, Flow Table rowspan continuation
hardening, WYSIWYG caret/edit stability work, flow-stack drag/resize UX polish,
conservative editor/layout refactoring guardrails, and the first project-owned
Thai font catalog with keyed measurement, paragraph-level text style controls,
PDF/DOCX export style coverage, server DOCX font variant embedding, and Flow
Table block layout controls for fit-to-width, alignment, top/bottom margin, and
selected canvas structure actions including path, clone/delete, and flow-stack movement,
plus the first run-level rich text model/render/export groundwork and fixed
paragraph text toolbar shell, and the flag-gated rich draft editor bridge with
basic toolbar/keyboard rich text commands, caret toolbar state hardening, and
focused rich export semantic coverage,
but not yet a general-user `v1`.

## Version Meaning

| Version | Meaning |
|---|---|
| `0.4.x` | Previous self-use baseline. Bug fixes, probes, docs, and small config safety improvements. |
| `0.5.0` | Accepted `flow-row` / `flow-stack` milestone for static cross-page row/column fragmentation. |
| `0.5.1` | Patch baseline for flow-row/flow-stack hardening, paragraph box controls, and right-rail Page/Properties UX. |
| `0.5.2` | Patch baseline for flow-backed Row/Columns authoring, right-rail layout polish, and PDF/DOCX border-style hardening. |
| `0.5.3` | Patch baseline for flow-stack Box styling, flow-row DOCX projection, focused PDF raster visual smoke, and local visual/WYSIWYG convenience scripts. |
| `0.5.15` | Patch baseline for paragraph-like Flow Table rowspan continuation, WYSIWYG caret/split-fragment stability, and flow-stack drag/drop plus pair-resize UX polish. |
| `0.5.17` | Patch baseline for editor resize/drag smoothness, WYSIWYG typing echo hardening, and focused performance probes without changing document or package schema versions. |
| `0.5.18` | Patch baseline for paginator module extraction, conservative EditorShell decomposition, ID/binding guardrails, and focused version/test alignment without changing document or package schema versions. |
| `0.6.0` | Minor pre-v1 milestone for the first runtime Thai font catalog, keyed server/browser font measurement, paragraph font selection, and server DOCX regular-font embedding without changing persisted document or package schema versions. |
| `0.6.1` | Patch baseline for paragraph-level bold/italic/underline/strikethrough/text-color controls, PDF/DOCX style export parity, and DOCX font variant embedding without changing persisted document or package schema versions. |
| `0.6.2` | Patch baseline for Flow Table fit-to-width, left/center/right alignment, table-block top/bottom margins, and DOCX alignment/margin preservation without changing persisted document or package schema versions. |
| `0.6.3` | Patch baseline for selected-node canvas path/action rail UX, clone/delete actions, and flow-stack subtree movement using column-creation placement semantics without changing persisted document or package schema versions. |
| `0.6.4` | Patch baseline for run-level rich text document operations, styled-run WYSIWYG text preservation, read-only render/export style coverage, and the fixed paragraph text toolbar shell without changing persisted document or package schema versions. |
| `0.6.5` | Patch baseline for the flag-gated rich draft live editor bridge, basic toolbar/keyboard rich text commands, pending-style typed insertion, and rich draft browser smoke coverage without changing persisted document or package schema versions. |
| `0.6.6` | Patch baseline for collapsed-caret rich toolbar state, rich draft smoke caret assertions, and DOCX rich-run semantic export coverage without changing persisted document or package schema versions. |
| `0.5.x` | Patch fixes and edge-case hardening for the `flow-row` / `flow-stack` milestone. |
| `0.6.x` | Patch fixes and edge-case hardening for the font/export milestone. |
| `0.7.0+` | Later pre-v1 milestones with user-visible stability or workflow gains. |
| `1.0.0` | First version acceptable for real user workflows without expected workarounds in the main path. |

## Patch Versions

Use patch versions such as `0.4.1` or `0.4.2` for small, reversible changes
that do not change the milestone target:

- focused WYSIWYG bug fixes
- focused regression tests or browser probes
- small local/dev config guardrails
- documentation notes that preserve decisions or known risks
- low-risk cleanup that does not change document model, pagination semantics,
  undo/redo, export behavior, or primary editor workflow

## Minor Versions

Use minor versions such as `0.5.0` or `0.6.0` for a meaningful pre-v1
milestone:

- save/load reliability improves enough to change day-to-day confidence
- WYSIWYG edit/show parity passes a broader accepted case set
- pagination or export behavior becomes materially more trustworthy
- a new workflow becomes usable end to end
- a default config or release gate changes in a way users would notice

During `0.x`, behavior can still change between minor versions. Treat minor
bumps as the place to absorb larger pre-v1 behavior changes instead of jumping
to `1.0.0` too early.

## Major Version

Reserve `1.0.0` for the first general-user baseline:

- main edit/save/load flow works without known workarounds
- undo/redo and persistence risks are accepted or resolved
- layout and WYSIWYG behavior are consistent in the core scenarios
- export behavior has a documented acceptance level
- run, test, and deploy/config paths are documented and repeatable
- remaining issues are explicitly known and acceptable after v1

## Bump Checklist

Before changing the version:

1. Classify the change as patch, minor, or major using this document.
2. Confirm the relevant tests or manual checks for the changed area.
3. Update `package.json`.
4. Record any deferred risks in the relevant active contract or work log.

Do not use the version number to hide uncertainty. If the behavior is not
verified, mark the risk clearly and keep the bump conservative.
