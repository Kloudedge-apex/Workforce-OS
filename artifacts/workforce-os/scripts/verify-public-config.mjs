import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(packageRoot, "../..");
const textExtensions = new Set([".css", ".html", ".svg", ".ts", ".tsx"]);

function read(relativePath) {
  return readFileSync(path.resolve(packageRoot, relativePath), "utf8");
}

function collectPublicSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPublicSourceFiles(absolutePath);
    if (/\.test\.[^.]+$/.test(entry.name)) return [];
    return textExtensions.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

const failures = [];
const indexHtml = read("index.html");
const favicon = read("public/favicon.svg");
const appSource = read("src/App.tsx");
const viteConfig = read("vite.config.ts");
const envExample = read(".env.example");
const dockerfile = readFileSync(
  path.resolve(repositoryRoot, "Dockerfile"),
  "utf8",
);

const publicSources = [
  path.resolve(packageRoot, "index.html"),
  ...collectPublicSourceFiles(path.resolve(packageRoot, "public")),
  ...collectPublicSourceFiles(path.resolve(packageRoot, "src")),
];

for (const sourceFile of publicSources) {
  if (/nikxius/i.test(readFileSync(sourceFile, "utf8"))) {
    failures.push(
      `stale Nikxius branding in ${path.relative(repositoryRoot, sourceFile)}`,
    );
  }
}

if (!indexHtml.includes("Workforce OS | Guarded AI SDR Console")) {
  failures.push("public metadata is missing the guarded Workforce OS identity");
}
if (!indexHtml.includes("human approval required before every send")) {
  failures.push("public metadata is missing the approval guardrail");
}
if (!favicon.includes('d="M7 9 L11 23 L16 13 L21 23 L25 9"')) {
  failures.push("favicon is missing the Workforce OS W mark");
}
if (favicon.includes('d="M9 23 V9 L23 23 V9"')) {
  failures.push("favicon still contains the legacy N mark");
}
if (/pk_(?:test|live)_[A-Za-z0-9_-]+/.test(appSource)) {
  failures.push("App.tsx contains a hard-coded Clerk publishable key");
}
if (
  !appSource.includes("requireClerkPublishableKey") &&
  !appSource.includes('scope="investor-demo"')
) {
  failures.push("App.tsx does not fail closed on missing Clerk configuration");
}
if (!viteConfig.includes("requireClerkPublishableKey")) {
  failures.push("Vite does not validate Clerk configuration at build time");
}
if (!envExample.includes("pk_test_REPLACE_WITH_YOUR_CLERK_PUBLISHABLE_KEY")) {
  failures.push(
    ".env.example does not contain the non-secret Clerk placeholder",
  );
}
if (/VITE_CLERK_PUBLISHABLE_KEY=pk_live_/.test(envExample)) {
  failures.push(".env.example contains a live Clerk publishable key");
}
if (!dockerfile.includes('test -n "${VITE_CLERK_PUBLISHABLE_KEY}"')) {
  failures.push("Dockerfile does not reject a missing Clerk build arg");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Public identity and Clerk configuration checks passed.");
