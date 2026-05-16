import fs from "fs";
import path from "path";

const RESERVED_METHODS = new Set([
  "constructor",
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "else",
  "return",
  "get",
  "set",
]);

export type SourceKind =
  | "controller"
  | "service"
  | "job"
  | "mailer"
  | "channel"
  | "route"
  | "unknown";

export type TestMember = {
  name: string;
  isStatic: boolean;
};

export type AnalyzedSource = {
  sourcePath: string;
  sourceRel: string;
  testPath: string;
  kind: SourceKind;
  className: string;
  members: TestMember[];
  importStatement: string;
};

export function resolveSourceFile(root: string, input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\//, "");

  const candidates: string[] = [];

  if (normalized.startsWith("@")) {
    const mapped = mapAliasToRelative(normalized);
    if (mapped) candidates.push(path.join(root, mapped));
  }

  candidates.push(path.join(root, normalized));
  candidates.push(path.join(root, `${normalized}.ts`));

  if (
    !normalized.startsWith("app/") &&
    !normalized.startsWith("configs/")
  ) {
    candidates.push(path.join(root, "app", normalized));
    candidates.push(path.join(root, "app", `${normalized}.ts`));
    candidates.push(path.join(root, "configs", normalized));
    candidates.push(path.join(root, "configs", `${normalized}.ts`));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  console.error(
    `\x1b[31m[Error]\x1b[0m Source file not found for: ${input}`,
  );
  console.error("Examples:");
  console.error("  rails g test app/controllers/admin/admin.controller.ts");
  console.error("  rails g test @controllers/admin/admin.controller");
  process.exit(1);
}

function mapAliasToRelative(aliasPath: string): string | null {
  const rules: [RegExp, string][] = [
    [/^@controllers\/(.+)$/, "app/controllers/$1"],
    [/^@services\/(.+)$/, "app/services/$1"],
    [/^@jobs\/(.+)$/, "app/jobs/$1"],
    [/^@mailers\/(.+)$/, "app/mailers/$1"],
    [/^@routes\/(.+)$/, "configs/routes/$1"],
  ];
  for (const [pattern, replacement] of rules) {
    const m = aliasPath.match(pattern);
    if (m) {
      const tail = m[1].replace(/\.ts$/, "") + ".ts";
      return replacement.replace("$1", tail);
    }
  }
  return null;
}

export function detectKind(sourceRel: string): SourceKind {
  if (sourceRel.includes(".controller.")) return "controller";
  if (sourceRel.includes(".service.")) return "service";
  if (sourceRel.includes(".job.")) return "job";
  if (sourceRel.includes(".mailer.")) return "mailer";
  if (sourceRel.includes(".channel.")) return "channel";
  if (sourceRel.includes(".route.")) return "route";
  return "unknown";
}

export function extractClassName(content: string): string | null {
  const m = content.match(/export\s+(?:abstract\s+)?class\s+(\w+)/);
  return m ? m[1] : null;
}

/** Public / static methods worth stubbing (user fills assertions). */
export function extractTestMembers(
  content: string,
  kind: SourceKind,
): TestMember[] {
  const members: TestMember[] = [];
  const seen = new Set<string>();

  const add = (name: string, isStatic: boolean) => {
    if (RESERVED_METHODS.has(name) || seen.has(name)) return;
    seen.add(name);
    members.push({ name, isStatic });
  };

  const lines = content.split(/\r?\n/);
  let inClass = false;

  for (const line of lines) {
    if (/export\s+(?:abstract\s+)?class\s+\w+/.test(line)) {
      inClass = true;
      continue;
    }
    if (!inClass) continue;

    if (/\b(private|protected)\b/.test(line)) continue;

    const staticMatch = line.match(/\bstatic\s+(?:async\s+)?(\w+)\s*\(/);
    if (staticMatch) {
      add(staticMatch[1], true);
      continue;
    }

    const methodMatch = line.match(
      /^\s+(?:(?:public|override|async)\s+)*(?:async\s+)?(\w+)\s*\(/,
    );
    if (methodMatch) {
      add(methodMatch[1], false);
    }
  }

  if (kind === "route" && !seen.has("draw")) {
    add("draw", false);
  }

  if (kind === "job" && !seen.has("perform")) {
    add("perform", false);
  }

  if (kind === "service" && members.length === 0) {
    add("execute", false);
  }

  return members;
}

export function buildImportStatement(
  root: string,
  sourcePath: string,
  testPath: string,
  className: string,
): string {
  const rel = path
    .relative(root, sourcePath)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");

  const aliasRules: { prefix: string; alias: string }[] = [
    { prefix: "app/controllers/", alias: "@controllers/" },
    { prefix: "app/services/", alias: "@services/" },
    { prefix: "app/jobs/", alias: "@jobs/" },
    { prefix: "app/mailers/", alias: "@mailers/" },
    { prefix: "configs/routes/", alias: "@routes/" },
  ];

  for (const { prefix, alias } of aliasRules) {
    if (rel.startsWith(prefix)) {
      return `import { ${className} } from "${alias}${rel.slice(prefix.length)}";`;
    }
  }

  let relImport = path
    .relative(path.dirname(testPath), sourcePath)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  if (!relImport.startsWith(".")) relImport = `./${relImport}`;
  return `import { ${className} } from "${relImport}";`;
}

export function testPathForSource(root: string, sourcePath: string): string {
  const rel = path.relative(root, sourcePath).replace(/\\/g, "/");
  const testRel = rel.replace(/\.ts$/, ".test.ts");
  return path.join(root, "__tests__", testRel);
}

export function analyzeSourceFile(
  root: string,
  input: string,
): AnalyzedSource {
  const sourcePath = resolveSourceFile(root, input);
  const content = fs.readFileSync(sourcePath, "utf-8");
  const className = extractClassName(content);

  if (!className) {
    console.error(
      `\x1b[31m[Error]\x1b[0m No exported class found in ${sourcePath}`,
    );
    process.exit(1);
  }

  const sourceRel = path.relative(root, sourcePath).replace(/\\/g, "/");
  const kind = detectKind(sourceRel);
  const testPath = testPathForSource(root, sourcePath);
  const members = extractTestMembers(content, kind);
  const importStatement = buildImportStatement(
    root,
    sourcePath,
    testPath,
    className,
  );

  return {
    sourcePath,
    sourceRel,
    testPath,
    kind,
    className,
    members,
    importStatement,
  };
}
