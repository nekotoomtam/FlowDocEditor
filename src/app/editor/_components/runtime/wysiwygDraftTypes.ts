export type WysiwygDraftMode =
  | "idle"
  | "plain-text"
  | "rich-text"
  | "readonly"
  | "unsupported"

export type WysiwygDraftPhase =
  | "idle"
  | "starting"
  | "active"
  | "composing"
  | "committing"
  | "cancelled"
  | "aborted"
  | "completed"

export type WysiwygDraftSessionSource =
  | "flowdoc-draft-island"
  | "paragraph-text-surface"
  | "shell-refocus"
  | "legacy-fallback"
  | "unknown"

export interface WysiwygDraftSession {
  id: string
  generation: number
  nodeId: string
  mode: WysiwygDraftMode
  phase: WysiwygDraftPhase
  startedAt: number
  updatedAt?: number
  committedAt?: number
  cancelledAt?: number
  abortedAt?: number
  completedAt?: number
  textVersion?: number
  draftTextLength?: number
  caretIndex?: number
  selectionStart?: number
  selectionEnd?: number
  isComposing: boolean
  compositionStartedAt?: number
  compositionEndedAt?: number
  source: WysiwygDraftSessionSource
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  abortReason?: string
  cancelReason?: string
}

export interface WysiwygDraftSessionIdentity {
  id: string
  generation?: number
}

export interface WysiwygDraftStartInput {
  nodeId: string
  mode: WysiwygDraftMode
  source: WysiwygDraftSessionSource
  initialTextLength?: number
  caretIndex?: number | null
  selectionStart?: number | null
  selectionEnd?: number | null
  textVersion?: number
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  timestamp: number
}

export interface WysiwygDraftCaretInput {
  caretIndex?: number | null
  selectionStart?: number | null
  selectionEnd?: number | null
  timestamp: number
}

export interface WysiwygDraftTextMetadataInput {
  textVersion?: number
  draftTextLength?: number
  timestamp: number
}

export interface WysiwygDraftMetricsSnapshot {
  wysiwygDraftSessionBeginCount: number
  wysiwygDraftSessionActiveCount: number
  wysiwygDraftSessionCommitCount: number
  wysiwygDraftSessionCancelCount: number
  wysiwygDraftSessionAbortCount: number
  wysiwygDraftCompositionStartCount: number
  wysiwygDraftCompositionEndCount: number
  wysiwygDraftStaleSessionIgnoredCount: number
  wysiwygDraftCurrentGeneration: number
  wysiwygDraftCurrentPhase: WysiwygDraftPhase
  wysiwygDraftCurrentNodeId: string | null
  wysiwygDraftSource: WysiwygDraftSessionSource | null
}

export type WysiwygDraftRuntimeEventAction =
  | "begin"
  | "superseded"
  | "active"
  | "caret"
  | "text-metadata"
  | "composition-start"
  | "composition-end"
  | "committing"
  | "committed"
  | "cancelled"
  | "aborted"
  | "completed"
  | "stale-ignored"

export interface WysiwygDraftRuntimeEvent {
  action: WysiwygDraftRuntimeEventAction
  id?: string
  generation?: number
  nodeId?: string
  mode?: WysiwygDraftMode
  phase?: WysiwygDraftPhase
  source?: WysiwygDraftSessionSource | string | null
  textVersion?: number
  draftTextLength?: number
  caretIndex?: number
  selectionStart?: number
  selectionEnd?: number
  isComposing?: boolean
  structuralTransactionId?: string | null
  structuralGeneration?: number | null
  abortReason?: string
  cancelReason?: string
  startedAt: number
}
