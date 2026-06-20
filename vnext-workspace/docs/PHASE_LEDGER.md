# vNext Workspace Phase Ledger

Parent goal:

- Build an extractable FlowDoc vNext core that can move to a new repository.

| Phase | Goal | Status | Evidence |
|---|---|---|---|
| 1 | Node vocabulary and model direction | done | parent repo docs |
| 2 | Relationship graph contract | done | parent repo docs |
| 3 | Package/schema boundary | done | parent repo docs |
| 4 | Prototype adapter plan | done | parent repo docs |
| 5 | First schema/graph slice | done | parent repo core slice |
| 5.5 | Extractable workspace | in progress | this folder |
| 6 | vNext product fixture | next | fixtures and tests |
| 7 | Legacy migration adapter | pending | migration tests |
| 8 | Package v2/document v3 parser | pending | persistence tests |
| 9 | vNext operations | pending | operation tests |
| 10 | Pagination/export integration | pending | renderer tests |
| 11 | Editor runtime bridge | pending | editor tests and smokes |
| 12 | Move to new repository | pending | repository extraction checklist |

## Current Rule

This workspace should prefer isolated vNext implementation over reuse. Reuse is
allowed only through explicit migration or compatibility adapters.
