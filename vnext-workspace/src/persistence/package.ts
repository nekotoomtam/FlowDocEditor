import { z } from "zod"
import { DocumentNodeSchema } from "../schema/document.js"

export type FlowDocPackageParseReason = "unsupported-version" | "invalid-package"

export interface FlowDocPackageParseIssue {
  severity: "error"
  code: string
  path: string
  message: string
}

export type FlowDocPackageParseResult =
  | { ok: true; package: FlowDocPackageV2DocumentVNext; issues: FlowDocPackageParseIssue[] }
  | { ok: false; reason: FlowDocPackageParseReason; issues: FlowDocPackageParseIssue[] }

export class FlowDocPackageParseError extends Error {
  constructor(
    public readonly reason: FlowDocPackageParseReason,
    public readonly issues: FlowDocPackageParseIssue[],
  ) {
    super(issues.map((issue) => `[${issue.path}] ${issue.message}`).join("\n"))
    this.name = "FlowDocPackageParseError"
  }
}

const FieldValueTypeSchema = z.enum(["text", "number", "date", "boolean", "enum", "image", "collection"])

export const FieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: FieldValueTypeSchema,
  fallback: z.string().optional(),
})

export const FieldRegistrySchema = z.object({
  version: z.literal(1),
  fields: z.record(z.string().min(1), FieldDefinitionSchema),
})

export const DataSnapshotSchema = z.object({
  version: z.literal(1),
  values: z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export const FlowDocPackageV2DocumentVNextSchema = z.object({
  packageVersion: z.literal(2),
  kind: z.literal("document"),
  id: z.string().min(1),
  meta: z.object({
    title: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
  document: DocumentNodeSchema,
  fields: FieldRegistrySchema,
  data: DataSnapshotSchema.optional(),
}).superRefine((pack, ctx) => {
  if (pack.id !== pack.document.document.id) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message: "package id must equal document id",
    })
  }
})

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type FieldRegistry = z.infer<typeof FieldRegistrySchema>
export type DataSnapshot = z.infer<typeof DataSnapshotSchema>
export type FlowDocPackageV2DocumentVNext = z.infer<typeof FlowDocPackageV2DocumentVNextSchema>

function formatIssuePath(path: readonly unknown[]): string {
  if (path.length === 0) {
    return ""
  }

  return path.reduce<string>((current, segment) => {
    if (typeof segment === "number") {
      return `${current}[${segment}]`
    }

    const key = String(segment)
    return current === "" ? key : `${current}.${key}`
  }, "")
}

function toParseIssue(issue: z.core.$ZodIssue): FlowDocPackageParseIssue {
  return {
    severity: "error",
    code: issue.code,
    path: formatIssuePath(issue.path),
    message: issue.message,
  }
}

function classifyParseReason(issues: FlowDocPackageParseIssue[]): FlowDocPackageParseReason {
  return issues.some((issue) => issue.path === "packageVersion" || issue.path === "document.version")
    ? "unsupported-version"
    : "invalid-package"
}

export function safeParseFlowDocPackageV2DocumentVNext(value: unknown): FlowDocPackageParseResult {
  const parsed = FlowDocPackageV2DocumentVNextSchema.safeParse(value)

  if (parsed.success) {
    return { ok: true, package: parsed.data, issues: [] }
  }

  const issues = parsed.error.issues.map(toParseIssue)
  return {
    ok: false,
    reason: classifyParseReason(issues),
    issues,
  }
}

export function parseFlowDocPackageV2DocumentVNext(value: unknown): FlowDocPackageV2DocumentVNext {
  const result = safeParseFlowDocPackageV2DocumentVNext(value)

  if (!result.ok) {
    throw new FlowDocPackageParseError(result.reason, result.issues)
  }

  return result.package
}

export function serializeFlowDocPackageV2DocumentVNext(value: FlowDocPackageV2DocumentVNext): FlowDocPackageV2DocumentVNext {
  const parsed = parseFlowDocPackageV2DocumentVNext(value)
  return JSON.parse(JSON.stringify(parsed)) as FlowDocPackageV2DocumentVNext
}
