# Editor Operation Architecture

## Core Philosophy
FlowDocEditor is transitioning to an **Editor Operation Architecture**. The core principle is that **User Actions should not directly mutate the application state or document tree**. Instead, actions are mapped to an **Operation** which serves as the fundamental orchestration spine.

### The Pipeline
Every significant editor interaction should follow this unidirectional pipeline:
```text
User Action
  ↓
Operation Intent (What does the user want to do?)
  ↓
Operation Scope (Which nodes/pages are affected?)
  ↓
Operation Plan (How urgent is this? What runtime should handle it?)
  ↓
Runtime Router / Orchestration
  ↓
Commit (Dispatch existing EditorAction to Reducers)
  ↓
Preview Settle / Background Jobs
  ↓
History / Diagnostics
```

---

## Important Design Principles (Non-Goals & Constraints)

### 1. The Operation Architecture is NOT a new document model
The operation layer does **not** replace `DocumentNode` and will not be persisted directly into the core document schema. The `DocumentNode` remains strictly the authored document data. The operation layer is an ephemeral wrapper used during the application runtime lifecycle.

### 2. Core Document Operations vs Editor Operations
We draw a strict boundary between two concepts:
* **Core Document Operations:** Pure functions that change the node tree (e.g., `splitParagraphAtIndex`, `mergeParagraphWithPrevious`).
* **Editor Operations:** The orchestration around the document mutation (e.g., handling optimistic UI, focus/caret adjustments, running validation, scheduling preview settles).

### 3. Full Pagination Truth
The Operation layer must not confuse the frontend optimistic preview with authoritative truth. The server/API pagination remains the single source of truth. The frontend preview is strictly an optimistic/deferred representation, and stale operation results must be discarded if superseded.

### 4. AI as an Operation Proposer
In the future, AI features (e.g., auto-complete, styling suggestions) must **never** mutate document state directly. AI agents will construct an `Operation Proposal` and submit it to the same pipeline. This ensures AI actions undergo the same strict validation, human review, and history tracking as a standard user action.

```text
AI Suggestion → Operation Proposal → Validator → Review/Auto-Apply → Commit
```

### 5. Native Typing Hot Path
The Operation abstraction **does not** wrap every single keypress during active typing. The native-visible practical lane remains the authority for active typing sessions. The Operation Architecture engages primarily for structural keys (Enter, Backspace), style patching, and when committing a draft session (Blur/Escape).

---

## Migration Principle
The migration to this architecture is incremental. **Existing reducers, EditorActions, and runtimes remain valid.** The Operation layer acts as an orchestration spine wrapping the existing system, eventually swallowing and replacing direct controller logic piece by piece.
