import { execFileSync } from "node:child_process";

const [previousTag = "", appVersion = ""] = process.argv.slice(2);
const currentSha = process.env.GITHUB_SHA ?? "local build";
const workflowRun = process.env.GITHUB_RUN_NUMBER ?? "local";
const workflowUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "";

function commitSubjects() {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  try {
    return execFileSync("git", ["log", range, "--format=%s"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((subject) => subject.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const rewriteRules = [
  [/reader notes.*control tray|notes.*control tray/i, "Reader notes now open cleanly above the controls, and the playback tray takes less space."],
  [/scroll.*slider|reader.*slider|scrolling speed/i, "Reader progress and scrolling-speed controls support smooth, continuous dragging."],
  [/reader.*crash|reader launch|reader lifecycle/i, "Improved reader opening stability and safe lifecycle handling on Android."],
  [/arrange|ordering|move up|move down/i, "Improved saved-text ordering controls and locally persisted arrangement."],
  [/github pages|web edition|static web/i, "Added improvements to the free SwarLipi web edition and browser library experience."],
  [/encrypted.*backup|github backup/i, "Improved encrypted private-backup tools so recovery copies stay unreadable outside your passphrase."],
  [/release.*note/i, "GitHub Releases now show a clear summary of the changes included in each version."],
];

const ignoredSubjects = [/^record completed/i, /^fix .*type check/i, /^make static web export/i, /^fix backup service directory/i];
const highlights = [];

for (const subject of commitSubjects()) {
  const match = rewriteRules.find(([pattern]) => pattern.test(subject));
  const rewritten = match?.[1];
  if (rewritten && !highlights.includes(rewritten)) highlights.push(rewritten);
}

if (!highlights.length) {
  for (const subject of commitSubjects()) {
    if (!ignoredSubjects.some((pattern) => pattern.test(subject)) && !highlights.includes(subject)) {
      highlights.push(subject.endsWith(".") ? subject : `${subject}.`);
    }
    if (highlights.length === 4) break;
  }
}

if (!highlights.length) highlights.push("Maintenance and reliability improvements for SwarLipi.");

const sourceRange = previousTag ? `${previousTag} → this release` : "Initial published build";
const runLink = workflowUrl ? `[#${workflowRun}](${workflowUrl})` : `#${workflowRun}`;

console.log(`## What changed\n\n${highlights.map((highlight) => `- ${highlight}`).join("\n")}`);
console.log(`\n## Build details\n\n| Build detail | Value |\n| --- | --- |\n| Version name | **${appVersion}** |\n| Changes compared | ${sourceRange} |\n| Source commit | ${currentSha} |\n| Workflow run | ${runLink} |`);
console.log("\n## Installation\n\nInstall this APK over your existing SwarLipi app. Your offline library stays on the device; keep a backup before changing or resetting the device.");
