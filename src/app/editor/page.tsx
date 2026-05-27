"use client"

import dynamic from "next/dynamic"
import { DocumentPrepareOverlay } from "@/app/_components/DocumentPrepareOverlay"
import { getDocumentPrepareStep } from "./_components/documentLibrary"

const EditorShell = dynamic(() => import("./_components/EditorShell"), {
  ssr: false,
  loading: () => (
    <DocumentPrepareOverlay
      step={getDocumentPrepareStep("editor-load-shell")}
    />
  ),
})

export default function EditorPage() {
  return <EditorShell />
}
