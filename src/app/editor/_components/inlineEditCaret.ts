export type {
  WysiwygParagraphFragmentRange as InlineEditFragmentRange,
} from "./wysiwygCaretMapping"

export {
  findWysiwygPageIndexForOffset as findInlineEditPageIndexForCaret,
  findWysiwygPageIndexInFragmentRanges as findInlineEditPageIndexInRanges,
  getWysiwygParagraphFragmentRanges as getInlineEditFragmentRanges,
} from "./wysiwygCaretMapping"
