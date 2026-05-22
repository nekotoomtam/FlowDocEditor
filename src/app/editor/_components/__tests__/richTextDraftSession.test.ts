import { describe, expect, it } from "vitest"
import type { InlineNode, ParagraphNode, TextRun } from "@/schema"
import { pt } from "@/schema"
import {
  INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION,
  applyRichTextDraftSessionStyleCommand,
  changeWysiwygRichTextDraftSessionPlainText,
  endWysiwygRichTextDraftSessionState,
  isWysiwygRichTextDraftSessionLayoutFresh,
  markWysiwygRichTextDraftSessionLayoutFresh,
  moveWysiwygRichTextDraftSessionSelection,
  projectRichTextDraftSessionToWysiwygTextSession,
  replaceRichTextDraftSessionSelection,
  replaceRichTextDraftSessionSelectionWithFragments,
  startWysiwygRichTextDraftSessionState,
} from "../richTextDraftSession"
import { INACTIVE_WYSIWYG_TEXT_SESSION } from "../useWysiwygTextSession"

function textRun(id: string, text: string, style?: TextRun["style"]): TextRun {
  return style
    ? { id, type: "text", text, style }
    : { id, type: "text", text }
}

function paragraph(children: InlineNode[]): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "sarabun",
      textColor: "111827",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      strikethrough: false,
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children,
  }
}

function textRunSummary(node: ParagraphNode): unknown[] {
  return node.children.map((child) =>
    child.type === "text"
      ? { type: "text", text: child.text, style: child.style }
      : child,
  )
}

describe("rich text draft session adapter", () => {
  it("starts a sibling rich draft session and projects it into the legacy text session shape", () => {
    const state = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Alpha")]),
      caretOffset: 2,
      pageIndex: 1,
    })

    expect(isWysiwygRichTextDraftSessionLayoutFresh(state)).toBe(true)
    expect(projectRichTextDraftSessionToWysiwygTextSession(state)).toEqual({
      nodeId: "p1",
      pageIndex: 1,
      baseText: "Alpha",
      draftText: "Alpha",
      caretOffset: 2,
      selection: { anchorOffset: 2, focusOffset: 2 },
      dirtyVersion: 0,
      layoutVersion: 0,
    })
  })

  it("keeps collapsed pending style out of layout dirtiness until text is inserted", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "A")]),
      caretOffset: 1,
    })

    const pending = applyRichTextDraftSessionStyleCommand(started, { fontWeight: "bold" })
    const inserted = replaceRichTextDraftSessionSelection(pending, "x")

    expect(projectRichTextDraftSessionToWysiwygTextSession(pending)).toMatchObject({
      draftText: "A",
      dirtyVersion: 0,
      layoutVersion: 0,
    })
    expect(isWysiwygRichTextDraftSessionLayoutFresh(pending)).toBe(true)
    expect(projectRichTextDraftSessionToWysiwygTextSession(inserted)).toMatchObject({
      baseText: "A",
      draftText: "Ax",
      caretOffset: 2,
      selection: { anchorOffset: 2, focusOffset: 2 },
      dirtyVersion: 1,
      layoutVersion: 0,
    })
    expect(isWysiwygRichTextDraftSessionLayoutFresh(inserted)).toBe(false)
    expect(textRunSummary(inserted.draft!.paragraph)).toEqual([
      { type: "text", text: "A", style: undefined },
      { type: "text", text: "x", style: { fontWeight: "bold" } },
    ])
  })

  it("marks selected-range style commands dirty even when projected draftText is unchanged", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Hello")]),
      caretOffset: 5,
    })
    const selected = {
      ...started,
      draft: {
        ...started.draft!,
        selection: { anchorOffset: 1, focusOffset: 4 },
      },
    }

    const styled = applyRichTextDraftSessionStyleCommand(selected, { textDecoration: "underline" })

    expect(projectRichTextDraftSessionToWysiwygTextSession(styled)).toMatchObject({
      draftText: "Hello",
      selection: { anchorOffset: 1, focusOffset: 4 },
      dirtyVersion: 1,
      layoutVersion: 0,
    })
    expect(textRunSummary(styled.draft!.paragraph)).toEqual([
      { type: "text", text: "H", style: undefined },
      { type: "text", text: "ell", style: { textDecoration: "underline" } },
      { type: "text", text: "o", style: undefined },
    ])
  })

  it("projects rich fragment replacement as plain draftText for the legacy layout lane", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([
        textRun("t1", "Alpha "),
        textRun("t2", "Beta", { fontStyle: "italic" }),
      ]),
      caretOffset: 10,
    })
    const selected = {
      ...started,
      draft: {
        ...started.draft!,
        selection: { anchorOffset: 6, focusOffset: 10 },
      },
    }

    const replaced = replaceRichTextDraftSessionSelectionWithFragments(selected, [
      { text: "Bold", style: { fontWeight: "bold" } },
      { text: " plain" },
    ])

    expect(projectRichTextDraftSessionToWysiwygTextSession(replaced)).toMatchObject({
      baseText: "Alpha Beta",
      draftText: "Alpha Bold plain",
      caretOffset: 16,
      dirtyVersion: 1,
      layoutVersion: 0,
    })
    expect(textRunSummary(replaced.draft!.paragraph)).toEqual([
      { type: "text", text: "Alpha ", style: undefined },
      { type: "text", text: "Bold", style: { fontWeight: "bold" } },
      { type: "text", text: " plain", style: undefined },
    ])
  })

  it("applies plain text bridge changes while preserving existing rich runs", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([
        textRun("t1", "Hello ", { fontWeight: "bold" }),
        textRun("t2", "world", { fontStyle: "italic" }),
      ]),
      caretOffset: 11,
    })

    const changed = changeWysiwygRichTextDraftSessionPlainText(started, {
      text: "Hello wide world",
      caretOffset: 11,
      selection: { anchorOffset: 11, focusOffset: 11 },
    })

    expect(projectRichTextDraftSessionToWysiwygTextSession(changed)).toMatchObject({
      baseText: "Hello world",
      draftText: "Hello wide world",
      caretOffset: 11,
      selection: { anchorOffset: 11, focusOffset: 11 },
      dirtyVersion: 1,
      layoutVersion: 0,
    })
    expect(textRunSummary(changed.draft!.paragraph)).toEqual([
      { type: "text", text: "Hello wide ", style: { fontWeight: "bold" } },
      { type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
  })

  it("applies collapsed pending style when a plain text bridge insertion matches the active selection", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Base")]),
      caretOffset: 4,
    })
    const pending = applyRichTextDraftSessionStyleCommand(started, { fontWeight: "bold" })

    const changed = changeWysiwygRichTextDraftSessionPlainText(pending, {
      text: "Base!",
      caretOffset: 5,
      selection: { anchorOffset: 5, focusOffset: 5 },
    })

    expect(projectRichTextDraftSessionToWysiwygTextSession(changed)).toMatchObject({
      draftText: "Base!",
      caretOffset: 5,
      dirtyVersion: 1,
    })
    expect(changed.draft?.pendingStyle).toBeUndefined()
    expect(textRunSummary(changed.draft!.paragraph)).toEqual([
      { type: "text", text: "Base", style: undefined },
      { type: "text", text: "!", style: { fontWeight: "bold" } },
    ])
  })

  it("moves the rich draft selection without dirtying layout", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Alpha")]),
      caretOffset: 5,
    })

    const moved = moveWysiwygRichTextDraftSessionSelection(started, 2, {
      anchorOffset: 1,
      focusOffset: 2,
    })

    expect(projectRichTextDraftSessionToWysiwygTextSession(moved)).toMatchObject({
      draftText: "Alpha",
      caretOffset: 2,
      selection: { anchorOffset: 1, focusOffset: 2 },
      dirtyVersion: 0,
      layoutVersion: 0,
    })
    expect(isWysiwygRichTextDraftSessionLayoutFresh(moved)).toBe(true)
  })

  it("keeps the same object for duplicate rich draft selection moves", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Alpha")]),
      caretOffset: 2,
    })

    expect(moveWysiwygRichTextDraftSessionSelection(started, 2, {
      anchorOffset: 2,
      focusOffset: 2,
    })).toBe(started)
  })

  it("marks layout freshness independently from rich draft content", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "A")]),
    })
    const inserted = replaceRichTextDraftSessionSelection(started, "!")
    const fresh = markWysiwygRichTextDraftSessionLayoutFresh(inserted)

    expect(isWysiwygRichTextDraftSessionLayoutFresh(inserted)).toBe(false)
    expect(projectRichTextDraftSessionToWysiwygTextSession(fresh).layoutVersion).toBe(1)
    expect(isWysiwygRichTextDraftSessionLayoutFresh(fresh)).toBe(true)
  })

  it("projects inactive rich draft state as an inactive legacy text session", () => {
    expect(projectRichTextDraftSessionToWysiwygTextSession(endWysiwygRichTextDraftSessionState()))
      .toBe(INACTIVE_WYSIWYG_TEXT_SESSION)
  })
})
