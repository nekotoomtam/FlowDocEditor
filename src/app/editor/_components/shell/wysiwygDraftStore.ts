import { useSyncExternalStore } from "react"

export type WysiwygTextSelection = {
  anchorOffset: number
  focusOffset: number
}

export type WysiwygDraftStoreState = {
  nodeId: string | null
  text: string
  caretIndex: number | null
  selection: WysiwygTextSelection | null
  version: number
  source: string | null
}

export type WysiwygDraftNodeSnapshot = {
  active: boolean
  nodeId: string | null
  text: string
  caretIndex: number | null
  selection: WysiwygTextSelection | null
  version: number
}

type WysiwygDraftStoreUpdate = Partial<Omit<WysiwygDraftStoreState, "version">>

let state: WysiwygDraftStoreState = {
  nodeId: null,
  text: "",
  caretIndex: null,
  selection: null,
  version: 0,
  source: null,
}

const listeners = new Set<() => void>()
const draftListeners = new Set<() => void>()
const sessionListeners = new Set<() => void>()

const INACTIVE_NODE_SNAPSHOT: WysiwygDraftNodeSnapshot = {
  active: false,
  nodeId: null,
  text: "",
  caretIndex: null,
  selection: null,
  version: 0,
}

let lastNodeSnapshotState: WysiwygDraftStoreState | null = null
let lastNodeSnapshotNodeId: string | null = null
let lastNodeSnapshot: WysiwygDraftNodeSnapshot = INACTIVE_NODE_SNAPSHOT
let sessionState: WysiwygDraftStoreState = state

function areSelectionsEqual(
  previous: WysiwygTextSelection | null,
  next: WysiwygTextSelection | null,
): boolean {
  return previous === next || (
    previous !== null &&
    next !== null &&
    previous.anchorOffset === next.anchorOffset &&
    previous.focusOffset === next.focusOffset
  )
}

function isSameDraftState(
  previous: WysiwygDraftStoreState,
  next: WysiwygDraftStoreState,
): boolean {
  return (
    previous.nodeId === next.nodeId &&
    previous.text === next.text &&
    previous.caretIndex === next.caretIndex &&
    areSelectionsEqual(previous.selection, next.selection)
  )
}

export const wysiwygDraftStore = {
  getState: () => state,
  setState: (partial: WysiwygDraftStoreUpdate): WysiwygDraftStoreState => {
    const next = { ...state, ...partial }
    if (isSameDraftState(state, next)) return state
    const sessionChanged = state.nodeId !== next.nodeId
    state = {
      ...next,
      version: state.version + 1,
    }
    if (sessionChanged) sessionState = state
    listeners.forEach((l) => l())
    draftListeners.forEach((l) => l())
    if (sessionChanged) sessionListeners.forEach((l) => l())
    return state
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  subscribeDraft: (listener: () => void) => {
    draftListeners.add(listener)
    return () => draftListeners.delete(listener)
  },
  subscribeSession: (listener: () => void) => {
    sessionListeners.add(listener)
    return () => sessionListeners.delete(listener)
  },
}

export function getWysiwygDraftSnapshotForNode(nodeId: string | null): WysiwygDraftNodeSnapshot {
  if (!nodeId || state.nodeId !== nodeId) return INACTIVE_NODE_SNAPSHOT
  if (lastNodeSnapshotState === state && lastNodeSnapshotNodeId === nodeId) return lastNodeSnapshot
  lastNodeSnapshotState = state
  lastNodeSnapshotNodeId = nodeId
  lastNodeSnapshot = {
    active: true,
    nodeId: state.nodeId,
    text: state.text,
    caretIndex: state.caretIndex,
    selection: state.selection,
    version: state.version,
  }
  return lastNodeSnapshot
}

export function getWysiwygDraftSessionForNode(nodeId: string | null): WysiwygDraftStoreState | null {
  return nodeId && sessionState.nodeId === nodeId ? sessionState : null
}

export function useWysiwygDraftStore() {
  return useSyncExternalStore(
    wysiwygDraftStore.subscribe,
    wysiwygDraftStore.getState,
    wysiwygDraftStore.getState,
  )
}

export function useWysiwygDraftSnapshotForNode(nodeId: string | null): WysiwygDraftNodeSnapshot {
  const subscribe = nodeId ? wysiwygDraftStore.subscribeDraft : subscribeNoop
  return useSyncExternalStore(
    subscribe,
    () => getWysiwygDraftSnapshotForNode(nodeId),
    () => getWysiwygDraftSnapshotForNode(nodeId),
  )
}

export function useWysiwygDraftStoreForNode(nodeId: string | null): WysiwygDraftStoreState | null {
  const subscribe = nodeId ? wysiwygDraftStore.subscribeSession : subscribeNoop
  return useSyncExternalStore(
    subscribe,
    () => getWysiwygDraftSessionForNode(nodeId),
    () => getWysiwygDraftSessionForNode(nodeId),
  )
}

let lastSelectionSnapshot: { nodeId: string | null; selection: WysiwygTextSelection | null } = { nodeId: null, selection: null }

export function useWysiwygDraftSelection() {
  return useSyncExternalStore(
    wysiwygDraftStore.subscribeDraft,
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

function subscribeNoop() {
  return () => undefined
}

const flushHandlers = new Set<() => void>()
export function registerWysiwygDraftFlushHandler(handler: () => void) {
  flushHandlers.add(handler)
  return () => { flushHandlers.delete(handler) }
}
export function flushAllWysiwygDrafts() {
  flushHandlers.forEach((h) => h())
}
