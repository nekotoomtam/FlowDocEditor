export const DEFAULT_FONT_KEY = "default"
export const DEFAULT_FONT_CSS_FAMILY = "FlowDocDefault"

export interface FontRegistryEntry {
  key: string
  fileName: string
  cssFamily: string
  docxName: string
}

const FONT_REGISTRY: Record<string, FontRegistryEntry> = {
  default: {
    key: "default",
    fileName: "THSarabun.ttf",
    cssFamily: DEFAULT_FONT_CSS_FAMILY,
    docxName: "TH Sarabun New",
  },
  thSarabun: {
    key: "thSarabun",
    fileName: "THSarabun.ttf",
    cssFamily: DEFAULT_FONT_CSS_FAMILY,
    docxName: "TH Sarabun New",
  },
}

export function resolveFontEntry(fontFamilyKey: string | null | undefined): FontRegistryEntry {
  return FONT_REGISTRY[fontFamilyKey ?? DEFAULT_FONT_KEY] ?? FONT_REGISTRY[DEFAULT_FONT_KEY]
}

export function resolveFontFileName(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).fileName
}

export function resolveFontCssFamily(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).cssFamily
}

export function resolveDocxFontName(fontFamilyKey: string | null | undefined): string {
  return resolveFontEntry(fontFamilyKey).docxName
}
