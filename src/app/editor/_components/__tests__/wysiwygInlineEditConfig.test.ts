import { describe, expect, it } from "vitest"
import {
  resolveWysiwygInlineEditEnabled,
  resolveWysiwygIslandReactLiveAttrsEnabled,
  resolveWysiwygIslandSurfaceLiveLayerEnabled,
  resolveWysiwygPerfTraceEnabled,
  resolveWysiwygRichTextDraftEnabled,
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
    expect(resolveWysiwygTextEngineEnabled("enabled", "test")).toBe(true)
    expect(resolveWysiwygTextEngineEnabled("disabled", "development")).toBe(false)
  })

  it("requires a second acknowledgement before enabling in production", () => {
    expect(resolveWysiwygTextEngineEnabled("enabled", "production")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled("enabled", "production", "off")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled("enabled", "production", "yes")).toBe(false)
    expect(resolveWysiwygTextEngineEnabled("enabled", "production", "enabled")).toBe(true)
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

describe("resolveWysiwygRichTextDraftEnabled", () => {
  it("keeps the sibling rich draft lane disabled by default", () => {
    expect(resolveWysiwygRichTextDraftEnabled(undefined, true)).toBe(false)
    expect(resolveWysiwygRichTextDraftEnabled(undefined, false)).toBe(false)
  })

  it("requires the base text engine to be enabled first", () => {
    expect(resolveWysiwygRichTextDraftEnabled("enabled", false)).toBe(false)
    expect(resolveWysiwygRichTextDraftEnabled("enabled", true)).toBe(true)
  })

  it("allows explicit opt-out even when the base text engine is enabled", () => {
    expect(resolveWysiwygRichTextDraftEnabled("off", true)).toBe(false)
    expect(resolveWysiwygRichTextDraftEnabled(" unknown ", true)).toBe(false)
  })
})

describe("resolveWysiwygIslandReactLiveAttrsEnabled", () => {
  it("keeps React-rendered island live attributes enabled by default as fallback", () => {
    expect(resolveWysiwygIslandReactLiveAttrsEnabled(undefined)).toBe(true)
    expect(resolveWysiwygIslandReactLiveAttrsEnabled("unknown")).toBe(true)
  })

  it("allows explicit trace experiments to rely on ref-synced live attributes", () => {
    expect(resolveWysiwygIslandReactLiveAttrsEnabled("0")).toBe(false)
    expect(resolveWysiwygIslandReactLiveAttrsEnabled("off")).toBe(false)
    expect(resolveWysiwygIslandReactLiveAttrsEnabled("enabled")).toBe(true)
  })
})

describe("resolveWysiwygIslandSurfaceLiveLayerEnabled", () => {
  it("keeps the detached surface live layer disabled when the text engine is inactive", () => {
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled(undefined, false, "development")).toBe(false)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled(undefined, false, "test")).toBe(false)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled("unknown", true, "development")).toBe(false)
  })

  it("defaults the detached surface live layer on for active text-engine dev and test lanes", () => {
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled(undefined, true, "development")).toBe(true)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled(undefined, true, "test")).toBe(true)
  })

  it("keeps the detached surface live layer production default disabled", () => {
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled(undefined, true, "production")).toBe(false)
  })

  it("allows explicit overrides to detach or inline live children from the surface shell", () => {
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled("1", false, "production")).toBe(true)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled("enabled", false, "development")).toBe(true)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled("off", true, "development")).toBe(false)
    expect(resolveWysiwygIslandSurfaceLiveLayerEnabled("0", true, "test")).toBe(false)
  })
})
