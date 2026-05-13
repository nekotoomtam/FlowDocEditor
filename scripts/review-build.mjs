import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
const timeoutMs = Number(process.env.REVIEW_BUILD_TIMEOUT_MS ?? 600000)

function runReviewBuild() {
  return new Promise((resolve, reject) => {
    console.log("[review:build] running next build --webpack")
    console.log("[review:build] standalone type-check is required before this script in review:gate")

    const child = spawn(
      process.execPath,
      [nextBin, "build", "--webpack"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          FLOWDOC_REVIEW_BUILD_SKIP_NEXT_TYPECHECK: "1",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    )

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`review build timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.once("exit", (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`review build exited with code ${code}`))
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

runReviewBuild().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
