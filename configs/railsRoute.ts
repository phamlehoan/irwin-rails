import { RequestHandler, Router } from "express";
import "reflect-metadata";
import { action, ValidatorClass } from "../app";
import {
  buildSwaggerOp,
  defaultJsonRequestBody,
  inferActionApiDoc,
  mergeApiDocOptions,
  resolveApiDocSchema,
  type ApiDocOptions,
} from "./swagger";

export enum RestActions {
  Index = "index",
  Show = "show",
  New = "new",
  Create = "create",
  Edit = "edit",
  Update = "update",
  Destroy = "destroy",
}

export interface PermissionHandlers {
  forUser(permission: string): RequestHandler;
  forAny(permissions: string[]): RequestHandler;
}

export interface ActionPermissionMap {
  read: string;
  create: string;
  update: string;
  delete: string;
}

export interface CustomRouteOptions {
  setPermissionFor?: string;
  setPermissionForAny?: string[];
  /** OpenAPI — hoặc truyền `body`/`params`/`tags`… trực tiếp trên options (shorthand). */
  document?: ApiDocOptions;
}

/** Cho phép `post(path, handler, { body: Validator, tags: [...] })` thay vì bọc trong `document`. */
export type RouteHandlerOptions = CustomRouteOptions & Partial<ApiDocOptions>;

const SWAGGER_OPTION_KEYS = [
  "summary",
  "tags",
  "auth",
  "public",
  "params",
  "requiredParams",
  "body",
  "requiredBody",
  "requestBody",
  "file",
  "responses",
] as const satisfies readonly (keyof ApiDocOptions)[];

export interface RouteOptions {
  only?: RestActions[];
  except?: RestActions[];
  setPermissionFor?: string;
  /** Chấp nhận AM hoặc UM - dùng cho admin routes */
  setPermissionForAny?: string[];
  /** Document options cho resource (mặc định cho mọi action API). */
  document?: ApiDocOptions;
  /** Ghi đè / bổ sung `document` theo từng action (create, index, …). */
  documentByAction?: Partial<Record<RestActions, ApiDocOptions>>;
}

export abstract class RailsRoute {
  public readonly route: Router;
  /** Bật sau `path(ValidateUserLoginMiddleware)` — route sau đó tự `auth: true` trên Swagger. */
  private swaggerAuthGate = false;
  public static permissionFactory: PermissionHandlers;
  public static actionPermissionMap: ActionPermissionMap = {
    read: "READ",
    create: "CREATE",
    update: "UPDATE",
    delete: "DELETE",
  };

  constructor() {
    this.route = Router();
  }

  /** Override method này để định nghĩa routes */
  abstract draw(): void;

  /**
   * Helper để khởi tạo và lấy router (dùng trong index.ts)
   * @example app.use('/users', UserRoute.draw())
   */
  public static draw(): Router {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (this as any)();
    instance.draw();
    return instance.route;
  }

  /**
   * Gộp `document` + shorthand (`body`, `params`, …) trên route options.
   * `document` ưu tiên khi trùng key.
   */
  private resolveRouteDocument(
    options?: RouteHandlerOptions,
  ): ApiDocOptions | undefined {
    if (!options) return undefined;

    const fromTop: Record<string, unknown> = {};
    for (const key of SWAGGER_OPTION_KEYS) {
      const val = (options as Record<string, unknown>)[key];
      if (val !== undefined) fromTop[key] = val;
    }

    if (options.document) {
      return { ...fromTop, ...options.document };
    }

    return Object.keys(fromTop).length > 0
      ? (fromTop as ApiDocOptions)
      : undefined;
  }

  private extractActionHandlerMeta(
    handlers: RequestHandler[],
  ):
    | {
        controllerClass: new (...args: any[]) => any;
        action: string;
        controller: string;
      }
    | undefined {
    const lastHandler = handlers[handlers.length - 1];
    const meta = (lastHandler as any)?._swaggerMetadata;
    if (!meta?.controllerClass) return undefined;
    return meta;
  }

  private attachSwaggerMetadata(
    method: "get" | "post" | "put" | "delete" | "patch",
    path: string,
    handlers: RequestHandler[],
    options?: RouteHandlerOptions,
  ): void {
    const swaggerPath = path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
    const routeDocument = this.resolveRouteDocument(options);
    const actionMeta = this.extractActionHandlerMeta(handlers);

    if (!routeDocument && !actionMeta) return;

    let docInput: ApiDocOptions = {};

    if (actionMeta) {
      docInput = inferActionApiDoc(
        actionMeta.controllerClass,
        actionMeta.action,
        method,
        swaggerPath,
      );
    }

    docInput = mergeApiDocOptions(docInput, routeDocument);

    if (
      this.swaggerAuthGate &&
      docInput.public !== true &&
      docInput.auth !== false
    ) {
      docInput.auth = true;
    }

    if (actionMeta && !docInput.tags?.length) {
      docInput.tags = [
        actionMeta.controllerClass.name.replace(/Controller$/, ""),
      ];
    }

    if (actionMeta && !docInput.summary) {
      const cap =
        actionMeta.action.charAt(0).toUpperCase() + actionMeta.action.slice(1);
      docInput.summary = `${cap} ${docInput.tags?.[0] ?? actionMeta.controller}`;
    }

    if (
      ["post", "put", "patch"].includes(method) &&
      !docInput.body &&
      !docInput.requestBody &&
      !docInput.file
    ) {
      docInput.requestBody = defaultJsonRequestBody();
    }

    const defaultResponses: Record<string | number, string> =
      method === "post" ? { 201: "Created" } : { 200: "OK" };

    const { responses, ...opts } = docInput as Record<string, unknown>;
    const operation = this.buildRouteSwaggerOp(swaggerPath, opts, {
      responses:
        (responses as Record<number | string, string>) || defaultResponses,
    });

    const lastHandler = handlers[handlers.length - 1];
    if (typeof lastHandler === "function") {
      const existingMeta = (lastHandler as any)._swaggerMetadata || {};
      (lastHandler as any)._swaggerMetadata = {
        ...existingMeta,
        op: operation,
        action: existingMeta.action || "custom",
      };
    }
  }

  /**
   * Chuẩn hóa `document` → OpenAPI operation (params/body tự suy từ Validator nếu thiếu).
   */
  private buildRouteSwaggerOp(
    swaggerPath: string,
    document: Record<string, unknown> | undefined,
    defaults: {
      summary?: string;
      tags?: string[];
      auth?: boolean;
      responses?: Record<number | string, string>;
    },
  ): Record<string, unknown> {
    const docInput = { ...(document ?? {}) };
    const resolved = resolveApiDocSchema(docInput as ApiDocOptions);

    return buildSwaggerOp({
      path: swaggerPath,
      summary: (docInput.summary as string | undefined) ?? defaults.summary,
      tags: (docInput.tags as string[] | undefined) ?? defaults.tags,
      auth:
        docInput.auth !== undefined
          ? Boolean(docInput.auth)
          : defaults.auth,
      responses:
        (docInput.responses as Record<number | string, string> | undefined) ??
        defaults.responses,
      file: docInput.file as boolean | undefined,
      public: docInput.public as boolean | undefined,
      requestBody: docInput.requestBody as Record<string, unknown> | undefined,
      params: resolved.params,
      paramsOpenApi: resolved.paramsOpenApi,
      requiredParams: resolved.requiredParams,
      body: resolved.body,
      bodyOpenApi: resolved.bodyOpenApi,
      requiredBody: resolved.requiredBody,
    });
  }

  private isAuthGateMiddleware(handler: unknown): boolean {
    const h = Array.isArray(handler)
      ? handler[handler.length - 1]
      : handler;
    const meta = (h as { _swaggerMetadata?: { controller?: string } })
      ?._swaggerMetadata;
    return meta?.controller === "ValidateUserLoginMiddleware";
  }

  /**
   * Alias cho this.route.use()
   */
  protected path(...args: any[]) {
    for (const item of args) {
      if (this.isAuthGateMiddleware(item)) {
        this.swaggerAuthGate = true;
      }
    }
    this.route.use(...(args as [any]));
  }

  /**
   * Định nghĩa 7 routes chuẩn RESTful (Index, Show, New, Create, Edit, Update, Destroy)
   * Kèm theo logic Permission và Swagger
   */
  protected resource(
    Controller: new (...args: any[]) => any,
    options?: RouteOptions,
  ): void;
  protected resource(
    path: string,
    Controller: new (...args: any[]) => any,
    options?: RouteOptions,
  ): void;
  protected resource(
    arg1: string | (new (...args: any[]) => any),
    arg2?: (new (...args: any[]) => any) | RouteOptions,
    arg3?: RouteOptions,
  ) {
    let basePath = "/";
    let Controller: new (...args: any[]) => any;
    let options: RouteOptions | undefined;

    if (typeof arg1 === "string") {
      basePath = arg1;
      Controller = arg2 as new (...args: any[]) => any;
      options = arg3;
    } else {
      Controller = arg1 as new (...args: any[]) => any;
      options = arg2 as RouteOptions;
    }

    if (options?.only && options?.except) {
      throw new Error("Can only pass only or except!");
    }

    const getPermissionCode = (action: RestActions): string => {
      if ([RestActions.Index, RestActions.Show].includes(action)) {
        return RailsRoute.actionPermissionMap.read;
      }
      if ([RestActions.New, RestActions.Create].includes(action)) {
        return RailsRoute.actionPermissionMap.create;
      }
      if ([RestActions.Edit, RestActions.Update].includes(action)) {
        return RailsRoute.actionPermissionMap.update;
      }
      return RailsRoute.actionPermissionMap.delete; // For Destroy
    };

    const handler = (actionName: string) => action(Controller, actionName);
    const featureCodes: string[] =
      options?.setPermissionForAny ??
      (options?.setPermissionFor ? [options.setPermissionFor] : []);
    const withPermission = (actionName: string, permission: string) => {
      if (!RailsRoute.permissionFactory)
        throw new Error("RailsRoute.permissionFactory is not configured.");
      return [
        RailsRoute.permissionFactory.forUser(permission),
        handler(actionName),
      ];
    };

    const withAnyPermission = (actionName: string, perm: string) => {
      if (!RailsRoute.permissionFactory)
        throw new Error("RailsRoute.permissionFactory is not configured.");
      const codes = featureCodes.map((f: string) => `${f}::${perm}`);
      return [RailsRoute.permissionFactory.forAny(codes), handler(actionName)];
    };

    const isApi = !!options?.document;
    const apiOnly = isApi
      ? [
          RestActions.Index,
          RestActions.Show,
          RestActions.Create,
          RestActions.Update,
          RestActions.Destroy,
        ]
      : undefined;
    const effectiveOnly = isApi ? apiOnly : options?.only;
    const effectiveExcept = options?.except;

    const addApiRoute = (
      actionName: string,
      method: "get" | "post" | "put" | "delete",
      routePath: string,
      swaggerPath: string,
    ) => {
      // Generate a resource name like "Admin Users" from "/admin/users"
      const resourceName = basePath
        .split("/")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      // Capitalize the action name, e.g., "index" -> "Index"
      const capitalizedAction =
        actionName.charAt(0).toUpperCase() + actionName.slice(1);

      const defaultSummary = `${capitalizedAction} ${resourceName}`;

      // Tự động tạo tags từ tên Controller (bỏ hậu tố 'Controller')
      const defaultTags = [Controller.name.replace("Controller", "")];

      const baseDoc = options?.document
        ? {
            tags: options.document.tags || defaultTags,
            auth: true,
            summary: options.document.summary,
          }
        : { auth: true };
      const defaultResponses: Record<number, string> =
        actionName === "create"
          ? { 201: "Created", 403: "Forbidden", 422: "Validation failed" }
          : {
              200: "OK",
              403: "Forbidden",
              404: "Not Found",
              422: "Validation failed",
            };

      const docInput = {
        ...options?.document,
        ...options?.documentByAction?.[actionName as RestActions],
      };
      const op = this.buildRouteSwaggerOp(swaggerPath, docInput, {
        summary: baseDoc.summary || defaultSummary,
        tags: baseDoc.tags || defaultTags,
        auth: baseDoc.auth,
        responses: (options?.document?.responses ?? defaultResponses) as Record<
          number | string,
          string
        >,
      });

      const handlers: any[] = [];
      const permCode =
        actionName === "index" || actionName === "show"
          ? "Read"
          : actionName === "create"
            ? "Create"
            : actionName === "update"
              ? "Update"
              : "Delete";

      if (options?.setPermissionForAny?.length || options?.setPermissionFor) {
        if (!RailsRoute.permissionFactory) {
          throw new Error(
            "Cannot apply permissions: RailsRoute.permissionFactory is not configured.",
          );
        }
        if (options.setPermissionForAny?.length) {
          const permCodes = options.setPermissionForAny.map(
            (f: string) => `${f}::${permCode}`,
          );
          handlers.push(RailsRoute.permissionFactory.forAny(permCodes));
        } else if (options.setPermissionFor) {
          const permCodeWithOptions = `${options.setPermissionFor}::${permCode}`;
          handlers.push(
            RailsRoute.permissionFactory.forUser(permCodeWithOptions),
          );
        }
      }

      const mainHandler = handler(actionName);
      (mainHandler as any)._swaggerMetadata = { op, controller: Controller.name, action: actionName };
      handlers.push(mainHandler);

      (this.route as any)[method](routePath, ...handlers);
    };

    const useAnyPerm =
      options?.setPermissionForAny && options.setPermissionForAny.length > 0;
    const usePerm = options?.setPermissionFor && !useAnyPerm;

    const routes = [
      { action: RestActions.Index, method: "get", path: "/", apiPath: "/" },
      { action: RestActions.New, method: "get", path: "/new", apiPath: null },
      {
        action: RestActions.Show,
        method: "get",
        path: "/:id",
        apiPath: "/{id}",
      },
      { action: RestActions.Create, method: "post", path: "/", apiPath: "/" },
      {
        action: RestActions.Edit,
        method: "get",
        path: "/:id/edit",
        apiPath: null,
      },
      {
        action: RestActions.Update,
        method: "put",
        path: "/:id",
        apiPath: "/{id}",
      },
      {
        action: RestActions.Destroy,
        method: "delete",
        path: "/:id",
        apiPath: "/{id}",
      },
    ] as const;

    routes.forEach(({ action: act, method, path: subPath, apiPath }) => {
      if (!this.isAllowAccess(effectiveOnly, effectiveExcept, act)) return;
      if (isApi && !apiPath) return; // Skip non-API routes (new, edit) in API mode

      const fullPath = (basePath === "/" ? "" : basePath) + subPath;

      if (isApi) {
        addApiRoute(
          act as string,
          method,
          fullPath,
          (basePath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}") + (apiPath || "")).replace(/\/+/g, "/"),
        );
      } else {
        let handlers = [handler(act as string)];
        if (useAnyPerm) {
          const perm = getPermissionCode(act);
          handlers = withAnyPermission(act as string, perm);
        } else if (usePerm) {
          const perm = getPermissionCode(act);
          handlers = withPermission(
            act as string,
            `${options!.setPermissionFor}::${perm}`,
          );
        }
        (this.route as any)[method](fullPath, ...handlers);
      }
    });
  }

  private isAllowAccess(
    only: RestActions[] | undefined,
    except: RestActions[] | undefined,
    action: RestActions,
  ) {
    return (
      (!only && !except) ||
      (only && only?.includes(action)) ||
      (except && !except?.includes(action))
    );
  }

  // --- Helper Methods cho Custom Routes (GET, POST, PUT, DELETE) ---

  protected get(
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected get(
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected get(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    const { path, handlers, options } = this.resolveArgs(arg1, arg2, arg3);
    this.registerCustomRoute("get", path, handlers, options);
  }

  protected post(
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected post(
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected post(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    const { path, handlers, options } = this.resolveArgs(arg1, arg2, arg3);
    this.registerCustomRoute("post", path, handlers, options);
  }

  protected put(
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected put(
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected put(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    const { path, handlers, options } = this.resolveArgs(arg1, arg2, arg3);
    this.registerCustomRoute("put", path, handlers, options);
  }

  protected delete(
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected delete(
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected delete(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    const { path, handlers, options } = this.resolveArgs(arg1, arg2, arg3);
    this.registerCustomRoute("delete", path, handlers, options);
  }

  protected patch(
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected patch(
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ): void;
  protected patch(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    const { path, handlers, options } = this.resolveArgs(arg1, arg2, arg3);
    this.registerCustomRoute("patch", path, handlers, options);
  }

  private registerCustomRoute(
    method: "get" | "post" | "put" | "delete" | "patch",
    path: string,
    handlers: RequestHandler | RequestHandler[],
    options?: RouteHandlerOptions,
  ) {
    let finalHandlers: RequestHandler[] = Array.isArray(handlers)
      ? handlers
      : [handlers];

    // 1. Permission Middleware
    if (options?.setPermissionForAny?.length || options?.setPermissionFor) {
      if (!RailsRoute.permissionFactory) {
        throw new Error(
          "Cannot apply permissions: RailsRoute.permissionFactory is not configured.",
        );
      }
      if (options.setPermissionForAny?.length) {
        finalHandlers.unshift(
          RailsRoute.permissionFactory.forAny(options.setPermissionForAny),
        );
      } else if (options.setPermissionFor) {
        finalHandlers.unshift(
          RailsRoute.permissionFactory.forUser(options.setPermissionFor),
        );
      }
    }

    // 2. Swagger — tự suy từ controller action + route `document` (nếu có)
    this.attachSwaggerMetadata(method, path, finalHandlers, options);

    (this.route as any)[method](path, ...finalHandlers);
  }

  private resolveArgs(
    arg1: string | RequestHandler | RequestHandler[],
    arg2?: RequestHandler | RequestHandler[] | RouteHandlerOptions,
    arg3?: RouteHandlerOptions,
  ) {
    let path = "/";
    let handlers: RequestHandler | RequestHandler[];
    let options: RouteHandlerOptions | undefined;

    if (typeof arg1 === "string") {
      path = arg1;
      handlers = arg2 as RequestHandler | RequestHandler[];
      options = arg3;
    } else {
      handlers = arg1 as RequestHandler | RequestHandler[];
      options = arg2 as RouteHandlerOptions;
    }

    return { path, handlers, options };
  }
}
