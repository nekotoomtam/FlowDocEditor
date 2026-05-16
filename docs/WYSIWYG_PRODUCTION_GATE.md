# WYSIWYG Production Gate

This document defines when the FlowDoc-owned WYSIWYG text engine may be treated
as production-ready. The current status is experimental and opt-in.

Use this together with:

- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

## Release States

| State | Default | Purpose | Gate |
|---|---:|---|---|
| Legacy textarea editing | On | Stable fallback path for normal users. | Standard review gate and editor smoke. |
| WYSIWYG inline edit helpers | Off | Experimental caret/visual helper path. | `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`. |
| FlowDoc text engine | Off | Experimental SVG text/caret/selection editing lane. | `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`; production builds also require `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK=1`. |

The text engine must not become the default user path until the release checklist
below is fully PASS.

## Production Enablement Rule

In development and test, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` is enough
to run the experimental lane for verification.

For local self-use, prefer a local env file or a dedicated dev command so the
editor does not silently fall back to the legacy textarea path after restarting
the dev server. Before using any screenshot or manual repro as WYSIWYG parity
evidence, verify the editor shell reports:

```text
data-wysiwyg-text-engine-enabled="true"
```

Before the first staging/server trial, pause and confirm the deployment build
environment is intentionally exercising the WYSIWYG edit path. The public flags
must be present before the client bundle is built:

```powershell
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="1"
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT="1"
```

For local development, the same flags can be started through:

```powershell
npm.cmd run dev:wysiwyg
```

In production, the text engine also requires a separate release
acknowledgement:

```powershell
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="1"
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK="1"
```

The acknowledgement variable is deliberate. It should only be set after this
document's release checklist is complete for the target release.

Safe fallback switch:

```powershell
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="off"
```

Unsetting the text-engine flag also returns users to the legacy textarea path.

## Required Release Checklist

All rows must be PASS before enabling the text engine by default or setting the
production acknowledgement.

| Gate | Required Result | Evidence |
|---|---|---|
| Non-browser review gate | PASS | `npm.cmd run review:gate` |
| Browser review gate | PASS | `npm.cmd run review:browser` |
| WYSIWYG bundled browser smoke | PASS | `npm.cmd run smoke:wysiwyg-stage4c` |
| Installed Chrome WYSIWYG smoke | PASS | `SMOKE_BROWSER_CHANNEL=chrome npm.cmd run smoke:wysiwyg-stage4c` |
| Installed Edge WYSIWYG smoke | PASS | `SMOKE_BROWSER_CHANNEL=msedge npm.cmd run smoke:wysiwyg-stage4c` |
| Windows Chrome Thai IME manual row | PASS | `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` |
| Windows Edge Thai IME manual row | PASS | `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` |
| Page-boundary typing smoothness | PASS | Manual checklist below |
| Legacy fallback check | PASS | Text engine flag off; normal inline editing still works |

## Page-Boundary Smoothness Checklist

Run this manually on Windows Chrome and Edge before production acknowledgement.

1. Start the flagged editor:

   ```powershell
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="1"
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT="1"
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE="1"
   npm.cmd run dev
   ```

2. Open:

   ```text
   http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary
   ```

3. Confirm the target paragraph starts as one fragment.
4. Type until the active paragraph crosses to a second page.
5. Continue typing for at least five normal words after the page break.
6. Backspace until the paragraph shrinks back to one fragment.
7. Press Escape, then Ctrl+Z and Ctrl+Y.

Expected result:

- No visible duplicate, dropped, or out-of-order text.
- No page-boundary flicker that hides the active text.
- Focus stays in the active edit bridge while typing.
- Undo and redo each restore one intentional edit session.
- No inline textarea appears in the text-engine lane.
- No layout error badge appears.
- Perf trace does not show full browser-preview pagination in the immediate
  input lane for normal typing.

## Known Closed Gates

- Table-cell text-engine editing remains disabled until a separate table-cell
  design gate is accepted.
- Row-stack paragraphs may use the text-engine lane, but independent row/column
  continuation remains deferred.
- DOM accessibility status wiring exists, but full screen reader product
  validation is not complete.

## Status Terms

- `PASS`: Gate ran and met expected behavior.
- `FAIL / BLOCKER`: User-visible mismatch or data/layout risk.
- `RISK`: Gate passed with a release-relevant caveat.
- `UNKNOWN`: Gate not run or evidence is not strong enough.
