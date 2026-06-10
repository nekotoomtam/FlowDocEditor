import { useSyncExternalStore } from "react"

export type WysiwygTextSelection = {
  anchorOffset: number
  focusOffset: number
}

type State = {
  nodeId: string | null
  text: string
  caretIndex: number | null
  selection: WysiwygTextSelection | null
}

let state: State = {
  nodeId: null,
  text: "",
  caretIndex: null,
  selection: null,
}

const listeners = new Set<() => void>()

export const wysiwygDraftStore = {
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

export function useWysiwygDraftStore() {
  return useSyncExternalStore(
    wysiwygDraftStore.subscribe,
    wysiwygDraftStore.getState,
    wysiwygDraftStore.getState,
  )
}

export function useWysiwygDraftStoreForNode(nodeId: string): State | null {
  return useSyncExternalStore(
    wysiwygDraftStore.subscribe,
    () => {
      const state = wysiwygDraftStore.getState()
      return state.nodeId === nodeId ? state : null
    },
    () => {
      const state = wysiwygDraftStore.getState()
      return state.nodeId === nodeId ? state : null
    },
  )
}

let lastSelectionSnapshot: { nodeId: string | null; selection: WysiwygTextSelection | null } = { nodeId: null, selection: null }

export function useWysiwygDraftSelection() {
  return useSyncExternalStore(
    wysiwygDraftStore.subscribe,
    () => {
      const state = wysiwygDraftStore.getState()
      if (state.nodeId !== lastSelectionSnapshot.nodeId || state.selection !== lastSelectionSnapshot.selection) {
        lastSelectionSnapshot = { nodeId: state.nodeId, selection: state.selection }
      }
      return lastSelectionSnapshot
    },
    () => {
      const state = wysiwygDraftStore.getState()
      if (state.nodeId !== lastSelectionSnapshot.nodeId || state.selection !== lastSelectionSnapshot.selection) {
        lastSelectionSnapshot = { nodeId: state.nodeId, selection: state.selection }
      }
      return lastSelectionSnapshot
    },
  )
}

const flushHandlers = new Set<() => void>()
export function registerWysiwygDraftFlushHandler(handler: () => void) {
  flushHandlers.add(handler)
  return () => { flushHandlers.delete(handler) }
}
export function flushAllWysiwygDrafts() {
  flushHandlers.forEach((h) => h())
}
