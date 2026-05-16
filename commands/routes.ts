import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { RouteInfo } from "../configs";
import { resolveRailsAppRoot } from "./resolveRailsAppRoot";

try {
  require("ts-node").register({
    transpileOnly: true,
  });
  require("tsconfig-paths").register();
} catch (e) {}

const originalLog = console.log;
const originalInfo = console.info;
console.log = () => {};
console.info = () => {};

async function getApplication(): Promise<any> {
  const root = resolveRailsAppRoot();
  const potentialPaths = [
    process.env.APP_PATH,
    path.join(root, "configs/application"),
    path.join(root, "src/configs/application"),
    path.join(root, "src/app/application"),
    path.join(root, "app/application"),
    path.join(root, "index"),
    path.join(root, "app"),
    path.join(root, "src/app"),
  ].filter(Boolean) as string[];

  for (const appPath of potentialPaths) {
    const resolvedPath = [".ts", ".js", "/index.ts", "/index.js", ""]
      .map((ext) => appPath + ext)
      .find((p) => fs.existsSync(p));

    if (!resolvedPath) continue;

    try {
      const mod = await import(pathToFileURL(resolvedPath).href);
      const app = mod.default || mod;

      const isInstance = app && typeof app.bootstrap === "function";
      const isClass =
        typeof app === "function" &&
        app.prototype &&
        typeof app.prototype.bootstrap === "function";

      if (isInstance) return app;
      if (isClass) return new app();
    } catch (err) {
      originalLog(
        `\x1b[31m[Error] Failed to load application at ${appPath}:\x1b[0m`,
      );
      originalLog(err);
      process.exit(1);
    }
  }

  console.error(
    "Please ensure your application file exports an instance and is located in src/configs/application or configs/application.",
  );
  process.exit(1);
}

void (async () => {
  const application = await getApplication();
  application.bootstrap();
  const routes = application.getRoutes();

  console.log = originalLog;
  console.info = originalInfo;

  const searchTerm = (
    process.argv[2] ||
    process.env.S ||
    process.env.SEARCH ||
    ""
  ).toLowerCase();

  const filteredRoutes = routes.filter((r: RouteInfo) => {
    const fullPath = `${r.prefix}${r.path}`
      .replace(/\/+/g, "/")
      .toLowerCase();
    if (fullPath.includes("/api/")) return false;
    const method = r.method.toLowerCase();
    return (
      !searchTerm ||
      fullPath.includes(searchTerm) ||
      method.includes(searchTerm)
    );
  });

  if (searchTerm) {
    console.info(`\n--- ROUTES FILTERED BY: "${searchTerm}" ---\n`);
  } else {
    console.info("\n--- APPLICATION ROUTES ---\n");
  }

  filteredRoutes.forEach((r: RouteInfo) => {
    const methodStr = r.method.toUpperCase();
    const colors: Record<string, string> = {
      GET: "\x1b[32m",
      POST: "\x1b[33m",
      PUT: "\x1b[34m",
      PATCH: "\x1b[36m",
      DELETE: "\x1b[31m",
    };
    const color = colors[methodStr] || "\x1b[0m";
    const method = `${color}${methodStr.padEnd(7)}\x1b[0m`;

    let fullPath = `${r.prefix}${r.path}`.replace(/\/+/g, "/");
    if (fullPath.length > 1 && fullPath.endsWith("/")) {
      fullPath = fullPath.slice(0, -1);
    }

    let handler = "";
    if (r.controller && r.action) {
      handler = ` \x1b[90m=> ${r.controller.replace("Controller", "")}#${r.action}\x1b[0m`;
    }

    console.info(
      `${method}\x1b[36m| \x1b[0m${fullPath.padEnd(40)}${handler}`,
    );
  });

  console.info(
    `\nTotal: ${filteredRoutes.length} routes${searchTerm ? ` (filtered from ${routes.length})` : ""}\n`,
  );
})().catch((e: unknown) => {
  originalLog(e);
  process.exit(1);
});
