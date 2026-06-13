const mode = process.env.FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_PROBE_MODE ?? "ok-false"
const attempt = Number(process.env.FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_ATTEMPT ?? "1")

if (mode === "crash-then-pass") {
  if (attempt === 1) {
    console.error("intentional matrix runner process crash probe")
    process.exit(134)
  }
  console.log(JSON.stringify({
    ok: true,
    probe: "process-crash-retry",
    attempt,
  }, null, 2))
  process.exit(0)
}

console.error(JSON.stringify({
  ok: false,
  failure: "intentional matrix runner non-retry probe",
  attempt,
}, null, 2))
process.exit(1)
