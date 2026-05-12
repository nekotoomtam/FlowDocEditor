const ENABLED_VALUES = new Set(["1", "true", "on", "enabled"])
const DISABLED_VALUES = new Set(["0", "false", "off", "disabled"])

export function resolveWysiwygInlineEditEnabled(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT,
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = rawValue?.trim().toLowerCase()
  if (normalized && ENABLED_VALUES.has(normalized)) return true
  if (normalized && DISABLED_VALUES.has(normalized)) return false
  return false
}

export const WYSIWYG_INLINE_EDIT_ENABLED = resolveWysiwygInlineEditEnabled()

export function resolveWysiwygTextEngineEnabled(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE,
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = rawValue?.trim().toLowerCase()
  if (normalized && ENABLED_VALUES.has(normalized)) return true
  if (normalized && DISABLED_VALUES.has(normalized)) return false
  return false
}

export function resolveWysiwygPerfTraceEnabled(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE,
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = rawValue?.trim().toLowerCase()
  if (normalized && ENABLED_VALUES.has(normalized)) return true
  if (normalized && DISABLED_VALUES.has(normalized)) return false
  return false
}

export const WYSIWYG_TEXT_ENGINE_ENABLED = resolveWysiwygTextEngineEnabled()
export const WYSIWYG_PERF_TRACE_ENABLED = resolveWysiwygPerfTraceEnabled()
