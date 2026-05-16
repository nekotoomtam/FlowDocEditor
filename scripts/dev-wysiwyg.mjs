import { spawn } from "node:child_process"
import { dirname } from "node:path"

const nodeBin = dirname(process.execPath)
const env = {
  ...process.env,
  Path: `${nodeBin};${process.env.Path ?? ""}`,
  PATH: `${nodeBin};${process.env.PATH ?? ""}`,
  NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE: "1",
  NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT: "1",
}

function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, "run", "dev"],
      shell: false,
    }
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev"],
    shell: process.platform === "win32",
  }
}

console.log("Starting dev server with WYSIWYG text engine enabled")
console.log("NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1")
console.log("NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1")

const npmInvocation = resolveNpmInvocation()
const child = spawn(npmInvocation.command, npmInvocation.args, {
  stdio: "inherit",
  shell: npmInvocation.shell,
  env,
})

child.on("error", (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
