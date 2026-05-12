# Review Gate

A change must FAIL if any of the following is true:

## Scope Failure
- It changes files outside the approved scope without explanation.
- It introduces a broad refactor when a small patch was requested.
- It changes document schema without explicit approval.

## Editor Lifecycle Failure
- Inline edit can be closed without commit/reset policy.
- Document replacement can accidentally commit an old inline edit.
- Same-document actions do not finalize active inline edit safely.

## Pagination Failure
- Browser pagination can overwrite newer draft state.
- Visual output can be treated as fresh without version/generation checks.
- Server pagination and browser pagination ownership is unclear.

## Undo/Redo Failure
- User-visible edits bypass history.
- One edit session creates unexpected multiple undo steps.
- Fill/preview state mixes with authoritative document history.

## WYSIWYG Failure
- Textarea and SVG visual truth conflict without fallback.
- Focus can be lost during active typing due to remount.
- IME/composition behavior is not protected.
- Custom caret is enabled without safe fallback.

## Evidence Rule
Every PASS must cite code evidence.
Every FAIL must cite code evidence or a reproducible scenario.
If not verified, mark UNKNOWN.