"use client"

import dynamic from "next/dynamic"

const EditorShell = dynamic(() => import("./_components/EditorShell"), { ssr: false })

export default function EditorPage() {
  return <EditorShell />
}
