export interface DocumentIssue {
  path: string
  message: string
}

export class DocumentAssertionError extends Error {
  constructor(public readonly issues: DocumentIssue[]) {
    super(issues.map((issue) => `[${issue.path}] ${issue.message}`).join("\n"))
    this.name = "DocumentAssertionError"
  }
}
