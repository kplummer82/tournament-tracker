/* Reports which Learn guides have gone stale.
   For each guide in lib/learn/guide-sources.json, asks git whether any of the
   source paths it documents changed after the guide's `reviewed` date. Any
   commits found mean the guide's prose and screenshots are suspect.

   Advisory by design: always exits 0. Under GitHub Actions it also emits
   ::warning:: annotations so staleness shows in the checks UI without failing
   the build — docs must never block a code deploy.

   Usage: npm run learn:drift */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const MANIFEST = path.join(REPO, "lib/learn/guide-sources.json");
const CI = !!process.env.GITHUB_ACTIONS;

const { guides } = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

const git = (args) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }).trim();

// Guide bodies live next to the manifest; a guide edited after its `reviewed`
// date was presumably being updated, which is worth showing alongside drift.
const guidePath = (slug) => `components/learn/guides/${slug}.tsx`;

/* Watch paths are matched literally: Next.js dynamic routes contain [brackets],
   which git would otherwise read as pathspec wildcards and silently match
   nothing. `:(literal)` disables that magic. */
const literal = (p) => `:(literal)${p}`;

function commitsSince(since, paths) {
  // --since is day-granular, so a commit landing later the same day as a review
  // is missed. Acceptable for a nudge; reviewers bump `reviewed` on review day.
  const out = git([
    "log",
    `--since=${since}`,
    "--no-merges",
    "--format=%h\t%cs\t%s",
    "--",
    ...paths.map(literal),
  ]);
  return out ? out.split("\n") : [];
}

function missingPaths(paths) {
  return paths.filter((p) => !fs.existsSync(path.join(REPO, p)));
}

const stale = [];
const current = [];
const manifestProblems = [];

for (const [slug, entry] of Object.entries(guides)) {
  const gone = missingPaths(entry.watch);
  if (gone.length) manifestProblems.push({ slug, gone });

  const commits = commitsSince(entry.reviewed, entry.watch).map((line) => {
    const [sha, date, ...rest] = line.split("\t");
    return { sha, date, subject: rest.join("\t") };
  });

  // Edits to the guide file itself aren't drift — they're the fix.
  const guideEdits = commitsSince(entry.reviewed, [guidePath(slug)]).length;

  if (commits.length) stale.push({ slug, entry, commits, guideEdits });
  else current.push(slug);
}

/* ── Report ── */
const total = Object.keys(guides).length;
console.log(`\nLearn guide drift — ${total} guide${total === 1 ? "" : "s"} checked\n`);

if (!stale.length) {
  console.log(`  ✓ all ${total} current\n`);
} else {
  for (const { slug, entry, commits, guideEdits } of stale) {
    const shown = commits.slice(0, 8);
    console.log(`  ✗ ${slug} — last reviewed ${entry.reviewed}, ${commits.length} commit${commits.length === 1 ? "" : "s"} since:`);
    for (const c of shown) console.log(`      ${c.sha}  ${c.date}  ${c.subject}`);
    if (commits.length > shown.length) console.log(`      … and ${commits.length - shown.length} more`);
    if (entry.deck) console.log(`      ↳ deck also needs a rebuild: ${entry.deck}`);
    if (guideEdits) console.log(`      ↳ note: the guide itself was edited since — may already be partly handled`);
    console.log("");

    if (CI) {
      const detail = shown.map((c) => `${c.sha} ${c.subject}`).join("; ");
      const deck = entry.deck ? ` Deck also needs a rebuild (${entry.deck}).` : "";
      console.log(
        `::warning file=${guidePath(slug)},title=Learn guide may be stale::` +
          `${slug} was last reviewed ${entry.reviewed}; ${commits.length} commit(s) have touched what it documents since: ${detail}.${deck}`
      );
    }
  }

  console.log(`  ${current.length} current: ${current.join(", ") || "none"}\n`);
  console.log("  To resolve: update the guide (and re-run npm run learn:capture for");
  console.log("  screenshots), then bump `reviewed` in lib/learn/guide-sources.json.\n");
}

if (manifestProblems.length) {
  console.log("  Manifest paths that no longer exist (rename or drop them):");
  for (const { slug, gone } of manifestProblems) console.log(`    ${slug}: ${gone.join(", ")}`);
  console.log("");
  if (CI) {
    for (const { slug, gone } of manifestProblems) {
      console.log(
        `::warning file=lib/learn/guide-sources.json,title=Stale watch path::` +
          `${slug} watches paths that no longer exist: ${gone.join(", ")}`
      );
    }
  }
}

// Advisory only — never fail the build over documentation.
process.exit(0);
