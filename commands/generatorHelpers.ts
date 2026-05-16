import fs from "fs";
import path from "path";

export type NamespaceParts = {
  parts: string[];
  subDir: string;
  rawName: string;
};

/** Split `Admin/User`, `admin/user`, or `Admin:User` into namespace + resource name. */
export function parseNamespace(input: string): NamespaceParts {
  const parts = input.split(/[:/]/).filter(Boolean);
  const rawName = parts.pop()!;
  const subDir = parts.map((p) => p.toLowerCase()).join("/");
  return { parts, subDir, rawName };
}

/** First letter upper, giữ phần còn lại (DemoGen → DemoGen). */
export function pascalCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** File base camelCase (DemoGen → demoGen). */
export function fileBaseFromRaw(rawName: string): string {
  return rawName.charAt(0).toLowerCase() + rawName.slice(1);
}

export function namespacePrefix(parts: string[]): string {
  return parts.map((p) => pascalCase(p)).join("");
}

/** e.g. Admin + User → adminUser (matches configs/routes/admin/adminUser.route.ts). */
export function routeFileBase(parts: string[], modelName: string): string {
  if (parts.length === 0) {
    return modelName.toLowerCase();
  }
  return (
    parts.map((p) => p.toLowerCase()).join("") +
    modelName.charAt(0).toUpperCase() +
    modelName.slice(1).toLowerCase()
  );
}

export function routeClassName(parts: string[], modelName: string): string {
  return `${namespacePrefix(parts)}${pascalCase(modelName)}Route`;
}

export function configsRoutePath(
  root: string,
  subDir: string,
  fileBase: string,
): string {
  return path.join(root, "configs", "routes", subDir, `${fileBase}.route.ts`);
}

/** URL prefix for redirects, e.g. `admin/users` or `users`. */
export function urlPathPrefix(subDir: string, segment: string): string {
  const base = subDir ? `${subDir}/` : "";
  return `/${base}${segment}`.replace(/\/+/g, "/");
}

export type ServiceParent = {
  parentClass: string;
  parentImportPath: string;
  namespaceServicePath: string | null;
};

/**
 * ApplicationService at root; each namespace folder gets `{Namespace}Service`
 * in `{namespace}.service.ts` (created when missing).
 */
export function resolveServiceParent(
  root: string,
  parts: string[],
  subDir: string,
): ServiceParent {
  if (parts.length === 0) {
    return {
      parentClass: "ApplicationService",
      parentImportPath: "./application.service",
      namespaceServicePath: null,
    };
  }

  const segment = parts[parts.length - 1].toLowerCase();
  const parentClass = `${pascalCase(segment)}Service`;
  const namespaceServicePath = path.join(
    root,
    "app",
    "services",
    subDir,
    `${segment}.service.ts`,
  );

  return {
    parentClass,
    parentImportPath: `./${segment}.service`,
    namespaceServicePath,
  };
}

export function ensureNamespaceServiceFile(
  root: string,
  subDir: string,
  serviceParent: ServiceParent,
  writeFile: (filePath: string, content: string) => void,
): void {
  if (!serviceParent.namespaceServicePath) return;
  if (fs.existsSync(serviceParent.namespaceServicePath)) return;

  const depth = subDir ? subDir.split("/").length : 0;
  const applicationImport =
    (depth > 0 ? `${"../".repeat(depth)}` : "./") + "application.service";

  const content = `import { ApplicationService } from "${applicationImport}";

/**
 * Base service for ${serviceParent.parentClass.replace("Service", "")} namespace.
 */
export class ${serviceParent.parentClass} extends ApplicationService {}
`;

  writeFile(serviceParent.namespaceServicePath, content);
}
