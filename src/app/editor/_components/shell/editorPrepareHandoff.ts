import { readDocumentPrepareHandoff, type DocumentPrepareHandoff } from "../documentLibrary"

export function readInitialDocumentPrepareHandoff(): DocumentPrepareHandoff | null {
  if (typeof window === "undefined") return null
  return readDocumentPrepareHandoff(window.sessionStorage)
}
