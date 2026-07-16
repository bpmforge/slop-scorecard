#!/usr/bin/env node
// Posts or updates a single marked comment on the triggering pull request via the GitHub
// REST API, using the built-in fetch (Node >=18) -- deliberately avoids pulling in a
// third-party comment-posting Action to keep the dependency surface at zero.
import { readFileSync } from "node:fs";

const MARKER = "<!-- slop-scorecard-report -->";

const [, , bodyFilePath] = process.argv;
const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY; // "owner/repo"
const eventPath = process.env.GITHUB_EVENT_PATH;
const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";

if (!bodyFilePath || !token || !repository || !eventPath) {
  // Intentional graceful skip (e.g. run outside a pull_request context), not an error --
  // logged to stdout so callers can assert on it without needing stderr.
  console.log("postComment.mjs: missing required argument or GitHub Actions env var; skipping.");
  process.exit(0); // never fail the job over a comment-posting problem
}

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const issueNumber = event.pull_request?.number;
if (!issueNumber) {
  console.log("postComment.mjs: not a pull_request event with a number; skipping.");
  process.exit(0);
}

const body = `${MARKER}\n${readFileSync(bodyFilePath, "utf8")}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
};
const commentsUrl = `${apiUrl}/repos/${repository}/issues/${issueNumber}/comments`;

async function main() {
  const existingRes = await fetch(commentsUrl, { headers });
  if (!existingRes.ok) {
    console.error(`postComment.mjs: failed to list comments (${existingRes.status}); skipping.`);
    return;
  }
  const existing = await existingRes.json();
  const prior = existing.find((c) => typeof c.body === "string" && c.body.includes(MARKER));

  if (prior) {
    const res = await fetch(`${apiUrl}/repos/${repository}/issues/comments/${prior.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body }),
    });
    console.log(res.ok ? "Updated existing slop-scorecard comment." : `Update failed (${res.status}).`);
  } else {
    const res = await fetch(commentsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
    console.log(res.ok ? "Posted slop-scorecard comment." : `Post failed (${res.status}).`);
  }
}

main().catch((err) => {
  console.error("postComment.mjs error (non-fatal):", err);
});
