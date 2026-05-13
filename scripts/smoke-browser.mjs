import { chromium } from "playwright"

const MISSING_BUNDLED_BROWSER_HINT = [
  "Browser smoke cannot find bundled Playwright Chromium.",
  "Run one of:",
  "- npx playwright install chromium",
  "- SMOKE_EXECUTABLE_PATH=/path/to/chrome npm run review:browser",
  "- SMOKE_BROWSER_CHANNEL=chrome npm run review:browser",
].join("\n")

export function getSmokeBrowserConfig({ headless = process.env.HEADED !== "1" } = {}) {
  const channel = process.env.SMOKE_BROWSER_CHANNEL?.trim() || undefined
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH?.trim() || undefined

  if (channel && executablePath) {
    throw new Error("Use either SMOKE_BROWSER_CHANNEL or SMOKE_EXECUTABLE_PATH for smoke browser selection, not both.")
  }

  return { channel, executablePath, headless }
}

export function smokeBrowserLabel(config) {
  if (config.executablePath) return `executable:${config.executablePath}`
  if (config.channel) return `channel:${config.channel}`
  return "bundled-chromium"
}

function smokeLaunchOptions(config) {
  return {
    headless: config.headless,
    ...(config.channel ? { channel: config.channel } : {}),
    ...(config.executablePath ? { executablePath: config.executablePath } : {}),
  }
}

function isMissingBundledBrowserError(error, config) {
  if (config.channel || config.executablePath) return false

  const message = String(error?.message ?? error)
  return (
    message.includes("Executable doesn't exist") &&
    message.toLowerCase().includes("playwright") &&
    message.toLowerCase().includes("install")
  )
}

function missingBundledBrowserError(error) {
  const wrapped = new Error([
    MISSING_BUNDLED_BROWSER_HINT,
    "",
    "Original Playwright error:",
    String(error?.message ?? error),
  ].join("\n"))
  wrapped.cause = error
  return wrapped
}

export async function launchSmokeBrowser(config) {
  try {
    return await chromium.launch(smokeLaunchOptions(config))
  } catch (error) {
    if (isMissingBundledBrowserError(error, config)) {
      throw missingBundledBrowserError(error)
    }

    throw error
  }
}
