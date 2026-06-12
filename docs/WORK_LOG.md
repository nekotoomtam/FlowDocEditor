# Work Log

This file is the durable work summary for FlowDocEditor. It is intentionally
short. Do not append full session transcripts, command logs, or repeated
per-task evidence here.

Use this file only for:

- accepted release or readiness baselines
- meaningful contract or architecture changes
- behavior changes with durable verification value
- open risks that future sessions must see before editing

Use `docs/WORK_LOG_RECENT.md` for the current handoff context. Use git history
for older line-by-line work-log detail.

## Current Baseline

- Latest project readiness marker: `0.6.33` on 2026-06-12.
- Persisted document schema remains `DocumentNode` v1.
- FlowDoc package/localStorage default remains package v2.
- PDF remains the authoritative export target.
- DOCX remains an exchange format that may reflow in Word/LibreOffice.
- Browser preview may be optimistic during editing; server/API pagination
  remains authoritative for final layout status and export in the current model.

## Durable Milestones

| Date | Area | Durable result | Verification anchor |
|---|---|---|---|
| 2026-06-12 | Release `0.6.33` | Editor render/action separation and WYSIWYG island render-scope hardening accepted: ownership/invalidation contracts, structural handler extraction, page render churn guards, detached island live-layer dev/test defaulting, split trace windows, page-boundary selection safety gates, and draft-store accessibility status updates without schema/package-version changes. | type-check, focused app tests, Stage4C smoke, detached safety trace, project version marker test |
| 2026-06-09 | Editor Operation Architecture Phase 1-3A | Extracted paragraph split/merge plans and split handlers from the controller without changing flushSync boundaries or behavior. | type-check, WYSIWYG smoothness smoke, editor shell tests |
| 2026-06-08 | Release `0.6.31` | Active documentation cleanup accepted: compact work logs, single-source agent docs, shorter docs index, and concise frontend runtime architecture reference. | stale-reference scan, docs diff check, project version marker test |
| 2026-06-08 | Release `0.6.30` | Large-document boot and pagination performance hardening accepted: raw localStorage parse reuse and pagination measurement-cache hardening. | focused profile coverage |
| 2026-06-07 | Release `0.6.29` | WYSIWYG history/re-enter fixes and large-document performance hardening accepted as the current baseline. | type-check, focused app regressions, perf baseline, WYSIWYG smoothness smoke, `git diff --check` |
| 2026-06-06 | Preview settle Tasks 38-42 | Browser preview and draft-pagination output lanes moved behind Shell callback executors without intentionally changing document, pagination, reducer, export, persistence, FlowTable, typing, or IME behavior. | focused adapter/bridge/runtime tests, runtime/editor regressions, long-mock smoothness smoke |
| 2026-06-05 | Preview settle Tasks 31-37 | Runtime/bridge/apply-plan boundaries established; first movement order accepted before output-lane executor work. | docs/code evidence audit, focused preview-settle tests |
| 2026-06-04 | Frontend runtime Tasks 14-18 | Structural edit, panel deferral, preview settle, and runtime boundary extraction work established the current frontend runtime refactor direction. | runtime tests, type-check, structural smoothness probes |
| 2026-06-04 | Release `0.6.26` | Structural edit performance attribution and render-isolation baseline accepted. | project version marker test and focused probes |
| 2026-06-03 | Release `0.6.25` | Structural editing gate accepted before later runtime extraction work. | focused editor/runtime checks |
| 2026-05 | Releases `0.6.x` | Paragraph style/export, Flow Table, WYSIWYG text-engine stages, package v2, field registry, data snapshot, editor UX, and layout hardening were added in stable slices. | contract docs, focused core/app tests, browser smoke where interaction risk applied |
| 2026-05-07 to 2026-05-10 | Foundation | Layout checklist, test strategy, product direction, agent operating model, text engine checklist, inline editing, page fragmentation, pagination fixtures, and API/export smoke coverage were established. | active docs and current test files |

## Current Open Risks

- Runtime output commits are still Shell-owned through callbacks. A larger
  coordinator or runtime-owned commit boundary needs a design gate before code
  movement.
- Large-document performance work remains split across startup/import, layout
  engine, canvas interaction, typing lane, and panel/selection side-effect
  tracks.
- Browser preview is still not the final source of layout truth.
- Range-level rich text, advanced review workflows, key history UI, and repeat
  region runtime behavior remain out of scope for the current baseline unless a
  new accepted design says otherwise.

## Update Rule

When adding a new entry, keep it to one short milestone row plus any new open
risk that changes future work. Put task-local evidence in the final response,
tests, reports, or the focused contract that owns the behavior.
