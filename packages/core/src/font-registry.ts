export const DEFAULT_FONT_KEY = "sarabun"

export type FontVariantKey = "regular" | "bold" | "italic" | "boldItalic"
export type FontPdfExportSupport = "embedded"
export type FontDocxExportSupport = "embedded-variants" | "name-only"

export interface FontExportSupport {
  pdf: FontPdfExportSupport
  docx: FontDocxExportSupport
}

export interface FontVariantEntry {
  fileName: string
  fontWeight: number
  fontStyle: "normal" | "italic"
}

export interface FontRegistryEntry {
  key: string
  displayName: string
  fileName: string
  cssFamily: string
  docxName: string
  license: string
  source: string
  exportSupport: FontExportSupport
  hidden?: boolean
  variants: Partial<Record<FontVariantKey, FontVariantEntry>>
}

const RUNTIME_FONT_EXPORT_SUPPORT: FontExportSupport = {
  pdf: "embedded",
  docx: "embedded-variants",
}

const FONT_REGISTRY: Record<string, FontRegistryEntry> = {
  sarabun: {
    key: "sarabun",
    displayName: "Sarabun",
    fileName: "Sarabun/Sarabun-Regular.ttf",
    cssFamily: "FlowDocSarabun",
    docxName: "Sarabun",
    license: "OFL-1.1",
    source: "Google Fonts / The Sarabun Project",
    exportSupport: RUNTIME_FONT_EXPORT_SUPPORT,
    variants: {
      regular: {
        fileName: "Sarabun/Sarabun-Regular.ttf",
        fontWeight: 400,
        fontStyle: "normal",
      },
      bold: {
        fileName: "Sarabun/Sarabun-Bold.ttf",
        fontWeight: 700,
        fontStyle: "normal",
      },
      italic: {
        fileName: "Sarabun/Sarabun-Italic.ttf",
        fontWeight: 400,
        fontStyle: "italic",
      },
      boldItalic: {
        fileName: "Sarabun/Sarabun-BoldItalic.ttf",
        fontWeight: 700,
        fontStyle: "italic",
      },
    },
  },
  notoSansThai: {
    key: "notoSansThai",
    displayName: "Noto Sans Thai",
    fileName: "Noto_Sans_Thai/static/NotoSansThai-Regular.ttf",
    cssFamily: "FlowDocNotoSansThai",
    docxName: "Noto Sans Thai",
    license: "OFL-1.1",
    source: "Google Fonts / Noto",
    exportSupport: RUNTIME_FONT_EXPORT_SUPPORT,
    variants: {
      regular: {
        fileName: "Noto_Sans_Thai/static/NotoSansThai-Regular.ttf",
        fontWeight: 400,
        fontStyle: "normal",
      },
      bold: {
        fileName: "Noto_Sans_Thai/static/NotoSansThai-Bold.ttf",
        fontWeight: 700,
        fontStyle: "normal",
      },
    },
  },
}

export function listFontRegistryEntries(options: { includeHidden?: boolean } = {}): FontRegistryEntry[] {
  return Object.values(FONT_REGISTRY).filter((entry) => options.includeHidden || !entry.hidden)
}

export function listSelectableFontEntries(): FontRegistryEntry[] {
  return listFontRegistryEntries()
}

export function listFontFaceEntries(): FontRegistryEntry[] {
  return listFontRegistryEntries({ includeHidden: true })
}

export function listRuntimeFontKeys(): string[] {
  return listFontRegistryEntries({ includeHidden: true }).map((entry) => entry.key)
}

export interface RuntimeFontVariantRequest {
  fontFamilyKey: string
  variant: FontVariantKey
  cacheKey: string
}

export function resolveFontVariantKeyForStyle(
  fontWeight: "normal" | "bold" | null | undefined,
  fontStyle: "normal" | "italic" | null | undefined,
): FontVariantKey {
  const bold = fontWeight === "bold"
  const italic = fontStyle === "italic"
  if (bold && italic) return "boldItalic"
  if (bold) return "bold"
  if (italic) return "italic"
  return "regular"
}

export function resolveFontVariantCacheKey(
  fontFamilyKey: string | null | undefined,
  variant: FontVariantKey = "regular",
): string {
  const entry = resolveFontEntry(fontFamilyKey)
  const resolvedVariant = resolveFontVariantEntry(entry.key, variant)
  const resolvedVariantKey = (Object.entries(entry.variants) as Array<[FontVariantKey, FontVariantEntry]>)
    .find(([, candidate]) => candidate === resolvedVariant)?.[0] ?? "regular"
  return resolvedVariantKey === "regular" ? entry.key : `${entry.key}:${resolvedVariantKey}`
}

export function listRuntimeFontVariantRequests(): RuntimeFontVariantRequest[] {
  return listFontRegistryEntries({ includeHidden: true }).flatMap((entry) =>
    (Object.keys(entry.variants) as FontVariantKey[]).map((variant) => ({
      fontFamilyKey: entry.key,
      variant,
      cacheKey: resolveFontVariantCacheKey(entry.key, variant),
    })),
  )
}

export function resolveFontEntry(fontFamilyKey: string | null | undefined): FontRegistryEntry {
  return FONT_REGISTRY[fontFamilyKey ?? DEFAULT_FONT_KEY] ?? FONT_REGISTRY[DEFAULT_FONT_KEY]
}

export function normalizeFontFamilyKey(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).key
}

export function resolveFontVariantEntry(
  fontFamilyKey: string | null | undefined,
  variant: FontVariantKey = "regular",
): FontVariantEntry {
  const entry = resolveFontEntry(fontFamilyKey)
  return entry.variants[variant] ?? entry.variants.regular ?? FONT_REGISTRY[DEFAULT_FONT_KEY].variants.regular!
}

export function resolveFontFileName(fontFamilyKey: string | null | undefined, variant: FontVariantKey = "regular"): string {
  return resolveFontVariantEntry(fontFamilyKey, variant).fileName
}

export function resolveFontCssFamily(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).cssFamily
}

export function resolveDocxFontName(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).docxName
}

export function resolveFontExportSupport(fontFamilyKey: string | null | undefined): FontExportSupport {
  return resolveFontEntry(fontFamilyKey).exportSupport
}
