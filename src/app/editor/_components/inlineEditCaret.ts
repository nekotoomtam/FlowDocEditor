// Compatibility alias for older inline-edit callers. The WYSIWYG caret
// mapping implementation in `wysiwygCaretMapping.ts` is the source of truth.
export type {
  WysiwygParagraphFragmentRange as InlineEditFragmentRange,
} from "./wysiwygCaretMapping"

export {
  findWysiwygPageIndexForOffset as findInlineEditPageIndexForCaret,
  findWysiwygPageIndexInFragmentRanges as findInlineEditPageIndexInRanges,
  getWysiwygParagraphFragmentRanges as getInlineEditFragmentRanges,
} from "./wysiwygCaretMapping"
