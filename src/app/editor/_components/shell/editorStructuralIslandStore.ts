import { useSyncExternalStore } from "react"
import type { OptimisticStructuralIslandOverride, OptimisticStructuralRefocusPaint } from "./editorShellTypes"

type State = {
  optimisticStructuralIslandOverride: OptimisticStructuralIslandOverride | null
  optimisticStructuralRefocusPaint: OptimisticStructuralRefocusPaint | null
}

let state: State = {
  optimisticStructuralIslandOverride: null,
  optimisticStructuralRefocusPaint: null,
}

const listeners = new Set<() => void>()

export const editorStructuralIslandStore = {
  getState: () => state,
  setState: (partial: Partial<State>) => {
    state = { ...state, ...partial }
    listeners.forEach((l) => l())
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useEditorStructuralIslandStore() {
  return useSyncExternalStore(
    editorStructuralIslandStore.subscribe,
    editorStructuralIslandStore.getState,
    editorStructuralIslandStore.getState,
  )
}
