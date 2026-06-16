import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const childScript = process.env.OUTLINE_PANEL_REPEAT_CHILD_SCRIPT
  ? path.resolve(repoRoot, process.env.OUTLINE_PANEL_REPEAT_CHILD_SCRIPT)
  : path.join(scriptDir, "outline-panel-list-draft-smoke.mjs")
const expectedActiveNodeId = process.env.OUTLINE_PANEL_REPEAT_EXPECTED_ACTIVE_NODE_ID ?? "li_00033"
const repeatLabel = process.env.OUTLINE_PANEL_REPEAT_LABEL ?? "Outline panel list-draft smoke repeat"
const expectNoop = process.env.OUTLINE_PANEL_REPEAT_EXPECT_NOOP === "1"
const expectedDropBlockedReason = process.env.OUTLINE_PANEL_REPEAT_EXPECTED_DROP_BLOCKED_REASON
  ?? (expectNoop ? "invalid-list-hierarchy" : null)
const expectedSubtreeChildCountRaw = process.env.OUTLINE_PANEL_REPEAT_EXPECTED_SUBTREE_CHILD_COUNT ?? "0"
const expectedSubtreeChildCount = Number(expectedSubtreeChildCountRaw)
const OUTPUT_TAIL_LIMIT = 6000
const DEFAULT_REPEAT = 3

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(
  Number.isInteger(expectedSubtreeChildCount) && expectedSubtreeChildCount >= 0,
  `OUTLINE_PANEL_REPEAT_EXPECTED_SUBTREE_CHILD_COUNT must be an integer >= 0; received ${JSON.stringify(expectedSubtreeChildCountRaw)}`,
)

function readCliOption(name) {
  const exact = `--${name}`
  const prefix = `${exact}=`
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (arg === exact) return process.argv[index + 1]
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function readRepeat() {
  const rawValue = readCliOption("repeat") ?? process.env.OUTLINE_PANEL_LIST_DRAFT_REPEAT ?? process.env.SMOKE_REPEAT
  if (rawValue == null || rawValue === "") return DEFAULT_REPEAT
  const value = Number(rawValue)
  assert(Number.isInteger(value) && value >= 1, `repeat must be an integer >= 1; received ${JSON.stringify(rawValue)}`)
  return value
}

function appendOutputTail(tail, text) {
  const nextTail = `${tail}${text}`
  return nextTail.length > OUTPUT_TAIL_LIMIT ? nextTail.slice(-OUTPUT_TAIL_LIMIT) : nextTail
}

function parseSmokeSummary(output, label) {
  const jsonStart = output.indexOf("{")
  if (jsonStart < 0) {
    throw new Error(`${label} produced no JSON summary.\n${output.trim()}`)
  }
  const jsonText = output.slice(jsonStart).trim()
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    throw new Error([
      `${label} produced an unreadable JSON summary: ${error.message}`,
      jsonText,
    ].join("\n"))
  }
}

function summarizeChildSample(summary) {
  const outline = summary.outline ?? {}
  const activeEdit = outline.activeEdit ?? {}
  const reorder = outline.reorder ?? {}
  const virtualization = outline.virtualization ?? {}
  return {
    browser: summary.browser?.mode ?? null,
    activeNodeId: activeEdit.nodeId ?? null,
    exactTextPreserved: activeEdit.exactTextPreserved ?? null,
    listSignaturePreserved: activeEdit.listSignaturePreserved ?? null,
    undoPreserved: activeEdit.undoPreserved ?? null,
    redoPreserved: activeEdit.redoPreserved ?? null,
    actionCountDelta: activeEdit.actionCountDelta ?? null,
    reorder: {
      sourceNodeId: reorder.sourceNodeId ?? null,
      targetNodeId: reorder.targetNodeId ?? null,
      expectNoop: reorder.expectNoop ?? null,
      beforeIndex: reorder.beforeIndex ?? null,
      afterIndex: reorder.afterIndex ?? null,
      expectedIndex: reorder.expectedIndex ?? null,
      attemptedIndex: reorder.attemptedIndex ?? null,
      dropBlockedReason: reorder.dropBlockedReason ?? null,
      ghostSubtreeChildCount: reorder.ghostSubtreeChildCount ?? null,
      expectedSubtreeChildCount: reorder.expectedSubtreeChildCount ?? null,
    },
    virtualization: {
      beforeRows: virtualization.before?.domRowCount ?? null,
      beforeRenderedRows: virtualization.before?.domRenderedRowCount ?? null,
      afterRows: virtualization.after?.domRowCount ?? null,
      afterRenderedRows: virtualization.after?.domRenderedRowCount ?? null,
    },
    ignoredResourceErrorCount: summary.ignoredResourceErrors?.length ?? null,
  }
}

function assertSampleSummary(sample, label) {
  assert(sample.activeNodeId === expectedActiveNodeId, `${label} used unexpected active node ${sample.activeNodeId}`)
  assert(sample.exactTextPreserved === true, `${label} did not preserve exact active draft text`)
  assert(sample.listSignaturePreserved === true, `${label} did not preserve list signature`)
  assert(sample.reorder.expectNoop === expectNoop, `${label} reported unexpected expectNoop=${sample.reorder.expectNoop}`)
  if (expectNoop) {
    assert(sample.undoPreserved == null, `${label} no-op sample should not run Undo`)
    assert(sample.redoPreserved == null, `${label} no-op sample should not run Redo`)
    assert(
      sample.reorder.dropBlockedReason === expectedDropBlockedReason,
      `${label} expected blocked reason ${expectedDropBlockedReason}, got ${sample.reorder.dropBlockedReason}`,
    )
    assert(sample.actionCountDelta?.reorder > 0, `${label} no-op sample did not record Outline reorder action lifecycle`)
  } else {
    assert(sample.undoPreserved === true, `${label} did not preserve active draft text through Undo`)
    assert(sample.redoPreserved === true, `${label} did not preserve active draft text through Redo`)
    assert(sample.reorder.dropBlockedReason == null, `${label} valid reorder unexpectedly reported a blocked drop`)
    assert(sample.actionCountDelta?.reorder > 0, `${label} did not record Outline reorder action`)
  }
  assert(
    sample.reorder.ghostSubtreeChildCount === expectedSubtreeChildCount,
    `${label} expected ghost subtree count ${expectedSubtreeChildCount}, got ${sample.reorder.ghostSubtreeChildCount}`,
  )
  assert(sample.actionCountDelta?.inlineFinalize > 0, `${label} did not record inline finalize before reorder`)
  assert(sample.reorder.afterIndex === sample.reorder.expectedIndex, `${label} reorder target index mismatch`)
  assert(sample.virtualization.beforeRows > sample.virtualization.beforeRenderedRows, `${label} did not start with bounded Outline virtualization`)
  assert(sample.virtualization.afterRows > sample.virtualization.afterRenderedRows, `${label} did not keep bounded Outline virtualization`)
}

async function runChildSmoke(label) {
  const child = spawn(process.execPath, [childScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OUTLINE_PANEL_LIST_DRAFT_REPEAT_CHILD: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  let output = ""
  let outputTail = ""

  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    output += text
    outputTail = appendOutputTail(outputTail, text)
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    output += text
    outputTail = appendOutputTail(outputTail, text)
    if (process.env.SMOKE_VERBOSE === "1") process.stderr.write(text)
  })

  const exitCode = await new Promise((resolve) => {
    child.once("close", (code) => resolve(code ?? 1))
  })
  if (exitCode !== 0) {
    throw new Error([
      `${label} failed with exit code ${exitCode}.`,
      outputTail.trim(),
    ].filter(Boolean).join("\n"))
  }
  return parseSmokeSummary(output, label)
}

async function main() {
  const repeat = readRepeat()
  const samples = []
  console.log(`Running ${repeatLabel} (${repeat} sample(s))`)

  for (let index = 0; index < repeat; index += 1) {
    const label = `sample ${index + 1}/${repeat}`
    const startedAt = Date.now()
    const childSummary = await runChildSmoke(label)
    const sample = summarizeChildSample(childSummary)
    assertSampleSummary(sample, label)
    const durationMs = Date.now() - startedAt
    samples.push({
      label,
      durationMs,
      summary: sample,
    })
    console.log(
      `PASS ${label}: durationMs=${durationMs} activeNodeId=${sample.activeNodeId} listSignaturePreserved=${sample.listSignaturePreserved} undo=${sample.undoPreserved} redo=${sample.redoPreserved} blocked=${sample.reorder.dropBlockedReason} subtree=${sample.reorder.ghostSubtreeChildCount}`,
    )
  }

  console.log(JSON.stringify({
    ok: true,
    label: repeatLabel,
    expectedActiveNodeId,
    expectNoop,
    expectedDropBlockedReason,
    expectedSubtreeChildCount,
    repeat,
    samples,
  }, null, 2))
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
