import { useCallback, useEffect, useRef, useState } from "react"
import {
  findNearestPageIndexInItems,
  type EditorPageNavItem,
} from "./editorCanvasNavigation"
import {
  scrollElementIntoNearestView,
  scrollElementIntoStartView,
} from "../editorPageFollow"

export function useEditorPageViewController({
  editorPageItems,
  pageKeyByPageIndex,
  selectedPageIndex,
  inlineEditPageIndex,
}: {
  editorPageItems: EditorPageNavItem[]
  pageKeyByPageIndex: Map<number, string>
  selectedPageIndex: number | null
  inlineEditPageIndex: number | null
}) {
  const pageRefs = useRef<Map<string, HTMLElement>>(new Map())
  const pageOverlayRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [viewPageIndex, setViewPageIndex] = useState<number | null>(null)
  const editorPageKeyByPageIndexRef = useRef<Map<number, string>>(pageKeyByPageIndex)

  useEffect(() => { editorPageKeyByPageIndexRef.current = pageKeyByPageIndex }, [pageKeyByPageIndex])

  const firstPageIndex = editorPageItems[0]?.pageIndex ?? 0
  const currentCanvasPageIndex = inlineEditPageIndex ?? viewPageIndex ?? selectedPageIndex ?? firstPageIndex

  const jumpToEditorPage = useCallback((page: EditorPageNavItem) => {
    setViewPageIndex(page.pageIndex)
    scrollElementIntoStartView(pageRefs.current.get(page.key))
  }, [])

  useEffect(() => {
    const nextPageIndex = inlineEditPageIndex ?? selectedPageIndex
    if (nextPageIndex !== null) setViewPageIndex(nextPageIndex)
  }, [inlineEditPageIndex, selectedPageIndex])

  useEffect(() => {
    if (editorPageItems.length === 0) {
      if (viewPageIndex !== null) setViewPageIndex(null)
      return
    }
    if (viewPageIndex !== null && !editorPageItems.some((page) => page.pageIndex === viewPageIndex)) {
      setViewPageIndex(findNearestPageIndexInItems(editorPageItems, viewPageIndex))
    }
  }, [editorPageItems, viewPageIndex])

  const requestInlineEditPageFollow = useCallback((pageIndex: number) => {
    const pageKey = editorPageKeyByPageIndexRef.current.get(pageIndex) ?? null
    if (!pageKey) return
    const scrollPage = () => {
      scrollElementIntoNearestView(pageRefs.current.get(pageKey))
    }
    if (typeof requestAnimationFrame === "undefined") {
      scrollPage()
      return
    }
    requestAnimationFrame(scrollPage)
  }, [])

  const setPageRef = useCallback((key: string, element: HTMLElement | null) => {
    if (element) pageRefs.current.set(key, element)
    else pageRefs.current.delete(key)
  }, [])

  const setPageOverlayRef = useCallback((key: string, element: HTMLElement | null) => {
    if (element) pageOverlayRefs.current.set(key, element)
    else pageOverlayRefs.current.delete(key)
  }, [])

  const getPageOverlayElement = useCallback((key: string) => pageOverlayRefs.current.get(key) ?? null, [])

  return {
    pageRefs,
    editorPageKeyByPageIndexRef,
    currentCanvasPageIndex,
    jumpToEditorPage,
    requestInlineEditPageFollow,
    setPageRef,
    setPageOverlayRef,
    getPageOverlayElement,
  }
}
