import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const ISSUE = process.argv[2] || "202604";
const OUT_DIR = path.join(ROOT, "_site");
const ISSUE_DIR = path.join(ROOT, ISSUE);
const PREVIEW_DIR = path.join(ROOT, "preview");

if (ISSUE === "202603") {
  throw new Error("202603 is intentionally excluded from the fixed-layout Pages preview.");
}
if (!/^\d{6}$/.test(ISSUE)) {
  throw new Error("Issue must be YYYYMM.");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectArticles() {
  const entries = await fs.readdir(ISSUE_DIR, { withFileTypes: true });
  const articles = [];

  for (const entry of entries
    .filter(item => item.isDirectory() && /^\d{2}_/.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))) {
    const articleDir = path.join(ISSUE_DIR, entry.name);
    const fixed = path.join(articleDir, "fixed_layout.html");
    if (!(await exists(fixed))) continue;

    const html = await fs.readFile(fixed, "utf8");
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : entry.name.replace(/^\d{2}_/, "");
    articles.push({
      label: entry.name.slice(0, 2) + " " + title,
      src: "../" + ISSUE + "/" + entry.name + "/fixed_layout.html",
      directory: entry.name,
    });
  }
  return articles;
}

async function main() {
  if (!(await exists(ISSUE_DIR))) throw new Error("Issue directory not found: " + ISSUE);
  if (!(await exists(PREVIEW_DIR))) throw new Error("preview directory not found.");

  const articles = await collectArticles();
  if (articles.length === 0) throw new Error("No fixed_layout.html found under " + ISSUE);

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  await fs.cp(PREVIEW_DIR, path.join(OUT_DIR, "preview"), { recursive: true });

  const outIssueDir = path.join(OUT_DIR, ISSUE);
  await fs.mkdir(outIssueDir, { recursive: true });

  const sharedImages = path.join(ISSUE_DIR, "images");
  if (await exists(sharedImages)) {
    await fs.cp(sharedImages, path.join(outIssueDir, "images"), { recursive: true });
  }

  for (const article of articles) {
    await fs.cp(
      path.join(ISSUE_DIR, article.directory),
      path.join(outIssueDir, article.directory),
      {
        recursive: true,
        filter: source => {
          const normalized = source.split(path.sep).join("/");
          return !normalized.includes("/preview/") &&
                 !normalized.includes("/pages/") &&
                 !normalized.includes("/intermediate/");
        },
      }
    );
  }

  const manifest = {
    issue: ISSUE,
    width: 1456,
    height: 2056,
    articles: articles.map(({ label, src }) => ({ label, src })),
  };
  await fs.writeFile(
    path.join(OUT_DIR, "preview", "articles.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(path.join(OUT_DIR, ".nojekyll"), "", "utf8");
  await fs.writeFile(
    path.join(OUT_DIR, "index.html"),
    '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./preview/"><title>fixed_layout preview</title><a href="./preview/">fixed_layout preview</a>\n',
    "utf8"
  );

  console.log("fixed_layout Pages preview site built.");
  console.log("issue:", ISSUE);
  console.log("articles:", articles.length);
  console.log("output:", path.relative(ROOT, OUT_DIR));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
