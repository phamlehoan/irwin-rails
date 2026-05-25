let swaggerDocument: any = {};

/** Chỉ đăng ký / hiển thị path bắt đầu bằng tiền tố này (vd. `/api`). `null` = mọi route. */
let swaggerApiPathPrefix: string | null = "/api";

export function setSwaggerApiPathPrefix(prefix: string | null): void {
  swaggerApiPathPrefix = prefix;
}

export function getSwaggerApiPathPrefix(): string | null {
  return swaggerApiPathPrefix;
}

function shouldIncludeSwaggerPath(path: string): boolean {
  if (swaggerApiPathPrefix === null) return true;
  return path === swaggerApiPathPrefix || path.startsWith(`${swaggerApiPathPrefix}/`);
}

function filterSwaggerPaths(paths: Record<string, unknown>): Record<string, unknown> {
  if (swaggerApiPathPrefix === null) return paths;
  const filtered: Record<string, unknown> = {};
  for (const [path, ops] of Object.entries(paths)) {
    if (shouldIncludeSwaggerPath(path)) filtered[path] = ops;
  }
  return filtered;
}

function mergeSwaggerDocument(existing: any, incoming: any): any {
  if (!existing || !Object.keys(existing).length) {
    return { ...incoming, paths: incoming.paths ?? {} };
  }

  const out: any = { ...existing, ...incoming };

  if (existing.components || incoming.components) {
    out.components = {
      ...(existing.components ?? {}),
      ...(incoming.components ?? {}),
    };
    if (existing.components?.securitySchemes || incoming.components?.securitySchemes) {
      out.components.securitySchemes = {
        ...(existing.components?.securitySchemes ?? {}),
        ...(incoming.components?.securitySchemes ?? {}),
      };
    }
  }

  if (!incoming.security && existing.security) {
    out.security = existing.security;
  }
  if (!incoming.servers && existing.servers) {
    out.servers = existing.servers;
  }

  const incomingPaths = incoming.paths ?? {};
  const hasIncomingPaths = Object.keys(incomingPaths).length > 0;
  out.paths = hasIncomingPaths
    ? { ...(existing.paths ?? {}), ...incomingPaths }
    : { ...(existing.paths ?? {}) };

  return out;
}

/** Đảm bảo `paths` tồn tại trước khi đăng ký route (app chưa gọi `setSwaggerDocument`). */
function ensureSwaggerPaths(): void {
  if (!swaggerDocument.paths) {
    if (!swaggerDocument.openapi) {
      swaggerDocument = {
        openapi: "3.0.0",
        info: { title: "API", version: "1.0.0" },
        paths: {},
      };
    } else {
      swaggerDocument.paths = {};
    }
  }
}

/**
 * Gộp cấu hình Swagger (không ghi đè `components.securitySchemes` khi app chỉ set `info`).
 */
export function setSwaggerDocument(doc: any) {
  swaggerDocument = mergeSwaggerDocument(swaggerDocument, doc);
  ensureSwaggerPaths();
}

/**
 * Registers a new path and operation in the Swagger document.
 */
export function registerSwaggerPath(
  path: string,
  method: string,
  operation: any,
) {
  if (!shouldIncludeSwaggerPath(path)) return;
  ensureSwaggerPaths();
  if (!swaggerDocument.paths[path]) {
    swaggerDocument.paths[path] = {};
  }
  swaggerDocument.paths[path][method] = operation;
}

/**
 * Returns the complete Swagger document object.
 */
export function getSwaggerDocs() {
  ensureSwaggerPaths();
  return {
    ...swaggerDocument,
    paths: filterSwaggerPaths(swaggerDocument.paths ?? {}),
  };
}
