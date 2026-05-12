import { describe, expect, it } from "vitest"
import {
  resolveWysiwygInlineEditEnabled,
  resolveWysiwygPerfTraceEnabled,
  resolveWysiwygTextEngineEnabled,
} from "../wysiwygInlineEditConfig"

describe("resolveWysiwygInlineEditEnabled", () => {
  it("keeps the experimental WYSIWYG path disabled by default in every environment", () => {
    expect(resolveWysiwygInlineEditEnabled(undefined, "development")).toBe(false)
    expect(resolveWysiwygInlineEditEnabled(undefined, "test")).toBe(false)
    expect(resolveWysiwygInlineEditEnabled(undefined, "production")).toBe(false)
  })

  it("allows explicit environment overrides", () => {
    expect(resolveWysiwygInlineEditEnabled("true", "production")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("enabled", "development")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("off", "development")).toBe(false)
  })

  it("normalizes case and whitespace while keeping unknown values disabled", () => {
    expect(resolveWysiwygInlineEditEnabled(" TRUE ", "development")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("unknown", "development")).toBe(false)
  })
})

describe("resolveWysiwygTextEngineEnabled", () => {
  it("keeps the FlowDoc-owned text engine lane disabled by default", () => {
    expect(resolveWysiwygTextEngineEnabled(undefined, "development")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled(undefined, "test")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled(undefined, "production")).toBe(false)
  })

  it("requires an explicit environment override", () => {
    expect(resolveWysiwygTextEngineEnabled("1", "development")).toBe(true)
    expect(resolveWysiwygTextEngineEnabled("enabled", "production")).toBe(true)
    expect(resolveWysiwygTextEngineEnabled("disabled", "development")).toBe(false)
  })

  it("does not inherit the legacy inline-edit flag value", () => {
    expect(resolveWysiwygTextEngineEnabled("unknown", "development")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled(" ON ", "development")).toBe(true)
  })
})

describe("resolveWysiwygPerfTraceEnabled", () => {
  it("keeps perf tracing disabled by default", () => {
    expect(resolveWysiwygPerfTraceEnabled(undefined, "development")).toBe(false)
    expect(resolveWysiwygPerfTraceEnabled(undefined, "test")).toBe(false)
    expect(resolveWysiwygPerfTraceEnabled(undefined, "production")).toBe(false)
  })

  it("allows explicit opt-in tracing", () => {
    expect(resolveWysiwygPerfTraceEnabled("true", "development")).toBe(true)
    expect(resolveWysiwygPerfTraceEnabled("on", "production")).toBe(true)
    expect(resolveWysiwygPerfTraceEnabled("0", "development")).toBe(false)
  })

  it("keeps tracing independent from the text engine rollout flag", () => {
    expect(resolveWysiwygPerfTraceEnabled("enabled", "development")).toBe(true)
    expect(resolveWysiwygPerfTraceEnabled("unknown", "development")).toBe(false)
  })
})
