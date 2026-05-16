# ts-rails

**The Rails-style application layer for TypeScript and Express** — routing, controllers, generators, real-time channels, mailers, background jobs, and shared utilities for the Irwin ecosystem.

| Language | Document |
|----------|----------|
| **English** (this file) | [README.md](./README.md) |
| Tiếng Việt | [README.vi.md](./README.vi.md) |
| 日本語 | [README.ja.md](./README.ja.md) |

---

## Table of contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Expected project layout](#expected-project-layout)
4. [Runtime library](#runtime-library)
5. [Subpath exports](#subpath-exports)
6. [CLI](#cli)
7. [Generators reference](#generators-reference)
8. [Related projects](#related-projects)
9. [License](#license)

---

## Overview

`ts-rails` is the **in-app framework** (not a full project scaffolder). Your application:

- Extends `RailsApplication` for HTTP + Socket.IO lifecycle.
- Declares routes with `RailsRoute` (`resource()`, `action()`, permissions, Swagger metadata).
- Implements controllers, services, jobs, mailers, and channels on top of base classes.

| Area | Main APIs |
|------|-----------|
| Application | `RailsApplication`, `MiddlewareFactory`, `loadConcerns`, `bootstrap()`, `getRoutes()` |
| Routing | `RailsRoute`, `RestActions`, `action()`, `resource()` |
| Controllers | `RailsController`, `@BeforeAction`, `@AfterAction`, strong params, `ApiResponse` |
| Real-time | `RailsChannel`, Socket.IO registration via `channelClasses` |
| Mail | `RailsMailer`, `MailerAdapter` |
| Jobs | `RailsJob`, `JobAdapter`, `performLater()` |
| Docs | Swagger registry from route `document` options |
| Utilities | `logger`, `Cache`, pagination, view helpers, `AppError` hierarchy |

For **new projects** and feature packs (`auth`, `admin`, …), use **[irwin-cli](../irwin-cli/PLAN.md)** (planned). This package focuses on **runtime + generators inside an existing app**.

---

## Installation

```bash
npm install ts-rails
# or
yarn add ts-rails
# or
pnpm add ts-rails
```

### Peer dependencies

Install the peers your app actually uses (Express is required for the core; others depend on features):

| Package | Used for |
|---------|----------|
| `express` | HTTP server |
| `reflect-metadata`, `class-validator`, `class-transformer` | Strong params / validation |
| `cookie-parser`, `method-override` | Standard middleware stack |
| `socket.io` | Channels |
| `nodemailer` | Mailers |
| `swagger-ui-express` | API docs UI (in your app) |
| `dayjs` | View helpers (`timeAgo`) |
| `pluralize` | CLI generators |
| `http-errors` | 404 / error handling |

### Use the CLI locally

The `rails` binary is published from this package. **Always run it from your app root** via the local install (paths with spaces on Windows break if you rely on a global install):

```bash
pnpm exec rails routes
pnpm exec rails g controller Posts
```

The CLI resolves the app root by walking up until it finds `app/controllers` (also respects `INIT_CWD`, `PNPM_SCRIPT_SRC_DIR`, `npm_config_local_prefix`).

---

## Expected project layout

Generators and conventions assume an Irwin-style tree:

```text
your-app/
├── app/
│   ├── controllers/          # required for CLI root detection
│   ├── views/
│   ├── services/
│   ├── jobs/
│   ├── mailers/
│   └── channels/
├── configs/
│   ├── application.ts        # class extending RailsApplication
│   ├── routes/               # *.route.ts (not under app/)
│   └── db/schema.prisma      # used by `g model`
└── __tests__/                # `g test` output (*.test.ts)
```

---

## Runtime library

### RailsApplication

`RailsApplication` owns the Express app, standard middleware, route mounting, error handlers, HTTP server, and Socket.IO.

```typescript
import { RailsApplication } from "ts-rails";
import { Route } from "./configs/routes";

export class Application extends RailsApplication {
  constructor() {
    super();
    this.port = process.env.PORT ?? "8000";
  }

  protected mountRoutes() {
    this.app.use("/", Route.draw());
  }

  public async initialize() {
    // Your DB, session, mailer, cache initializers
    this.bootstrap();
  }
}
```

**Static configuration** (set before `bootstrap()`):

| Property | Purpose |
|----------|---------|
| `middlewareFactory` | `requestId`, `requestLogging`, `rateLimit` (required) |
| `sessionMiddleware` | Optional; used for Socket.IO auth chain |
| `mailerAdapter` | Global mail delivery |
| `jobAdapter` | Queue backend (BullMQ, etc.) |
| `jobClasses` | Registered job classes |
| `channelClasses` | Socket.IO channel classes |
| `cacheStore` | App-wide cache |
| `loggerAdapter` | Logging backend |
| `hasher` | Password hashing (`Security` helper) |

**Lifecycle** (`bootstrap()` order):

1. `setupStandardMiddlewares()` — JSON, cookies, method override, view helper injection (`res.locals.h`)
2. `mountRoutes()` — override in subclass
3. `getRoutes()` — introspection + Swagger path registration
4. `setupSwagger()` — override in app for Swagger UI
5. `setupErrorHandlers()` — 404 + global handler (`AppError`, API vs HTML)
6. `startBackgroundProcessor()` — override for workers (skipped on Lambda / `IRWIN_CONSOLE`)

**Concerns** — mix shared methods into a controller prototype:

```typescript
this.loadConcerns(ApplicationController.prototype, "app/controllers/concerns");
```

### Routing (`RailsRoute`)

```typescript
import { RailsRoute, action, RestActions } from "ts-rails";
import { UsersController } from "@controllers/users.controller";

export class AppRoute extends RailsRoute {
  draw() {
    this.resource("/users", UsersController, {
      only: [RestActions.Index, RestActions.Show, RestActions.Create],
      setPermissionFor: "USER_MANAGEMENT",
      document: {
        tags: ["Users"],
        summary: "User CRUD",
        body: CreateUserValidator,
      },
    });

    this.get("/profile", action(UsersController, "profile"));
  }
}

// In application.ts:
// this.app.use("/", AppRoute.draw());
```

- **`resource()`** — RESTful routes (`index`, `show`, `new`, `create`, `edit`, `update`, `destroy`) with optional `only` / `except`, RBAC hooks (`setPermissionFor`, `setPermissionForAny`), and OpenAPI `document`.
- **`action(Controller, "methodName")`** — binds a controller method (runs `@BeforeAction` / `@AfterAction` filters).
- **File uploads** — pass `upload` options on routes (multer fields, limits, `fileFilter`); validated via `validateFileUpload` middleware.

Permission handlers are plugged in via `RailsRoute.permissionFactory` and `RailsRoute.actionPermissionMap`.

### Controllers (`RailsController`)

| Method / property | Description |
|-------------------|-------------|
| `this.params(Validator).permit(...)` | Merge params/query/body, validate with `class-validator`, whitelist fields |
| `this.render(view, locals)` | Pug/EJS view |
| `this.renderJson(data, status?)` | `{ success: true, data }` via `ApiResponse` |
| `this.redirect(path)` | HTTP redirect |
| `this.flash(type, message)` | Requires flash middleware |
| `this.io` | Socket.IO server from `req.app.get("io")` |
| `this.t(key, options?)` | i18n helper from `res.locals.t` |

**Filters** (class decorators):

```typescript
import { RailsController, BeforeAction, AfterAction } from "ts-rails";

@BeforeAction("authenticate", { except: ["index"] })
@AfterAction("logActivity", { only: ["create", "update"] })
export class UsersController extends RailsController {
  async authenticate() {
    if (!this.req.session?.userId) {
      this.res.status(401).json({ success: false, message: "Unauthorized" });
      return false; // halt chain
    }
  }
}
```

### Strong parameters

```typescript
export class CreateUserValidator {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  name: string;
}

async create() {
  const attrs = await this.params(CreateUserValidator).permit("email", "name");
  // Invalid input → 422 UnprocessableEntityError
}
```

### Standard API responses & pagination

```typescript
import { parsePagination, buildPaginatedResponse } from "ts-rails/pagination";

async index() {
  const { page, perPage, skip } = parsePagination(this.req.query);
  const [rows, total] = await fetchPage(skip, perPage);
  return this.renderJson(buildPaginatedResponse(rows, total, { page, perPage }));
}
```

Import `ApiResponse`, `parsePagination`, and `buildPaginatedResponse` from the main package or `ts-rails/pagination`.

### HTTP errors

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "ts-rails/errors";
```

Thrown errors are handled by `RailsApplication`’s error middleware (JSON for `/api/*`, HTML error view otherwise).

### Real-time channels (`RailsChannel`)

```typescript
import { RailsChannel } from "ts-rails";

export class ChatChannel extends RailsChannel {
  subscribe() {
    this.socket.on("message", (data) => {
      this.broadcastTo("room_1", "message", data);
    });
  }
}
```

Register channels on the application class:

```typescript
import * as channels from "@channels";
RailsApplication.channelClasses = Object.values(channels);
```

### Mailers (`RailsMailer`)

```typescript
export class UserMailer extends RailsMailer {
  static async welcome(user: { email: string; name: string }) {
    await this.deliver({
      to: user.email,
      subject: "Welcome",
      html: `<p>Hello ${user.name}</p>`,
    });
  }
}
```

Configure `RailsApplication.mailerAdapter` or override `getTransporter()` on `ApplicationMailer`.

### Background jobs (`RailsJob`)

```typescript
export class SyncDataJob extends RailsJob {
  async perform(payload: unknown) {
    // work
  }
}

await SyncDataJob.performLater({ id: 1 });
```

Configure `RailsApplication.jobAdapter` for async queues. Generated jobs extend `ApplicationJob` and may set `static cron` for `node-cron`.

### View helpers

Injected as `h` in templates (`res.locals.h`):

```typescript
import { viewHelpers as h } from "ts-rails";

h.timeAgo(new Date());
h.numberToCurrency(50000, "VND");
h.truncate("long text", 20);
h.assetPath("javascripts/main.ts"); // Vite manifest in production
```

### Swagger

Route `document` options register OpenAPI paths. Use `setupSwaggerUI` from the swagger module in your app’s `setupSwagger()` override. Validator classes on `document.body` map to JSON Schema via `class-validator` metadata.

### Logger & cache

```typescript
import { logger } from "ts-rails/logger";
import { Cache } from "ts-rails/cache";

logger.info("started");
await Cache.set("key", value, { ttl: 3600 });
```

Set `RailsApplication.loggerAdapter` and `RailsApplication.cacheStore` in initializers.

---

## Subpath exports

| Import | Module |
|--------|--------|
| `ts-rails` | Full public API (`app`, `configs`, `lib`) |
| `ts-rails/logger` | Logger adapter |
| `ts-rails/cache` | Cache store |
| `ts-rails/errors` | HTTP error classes |
| `ts-rails/pagination` | `parsePagination`, `buildPaginatedResponse` |

---

## CLI

Command name: **`rails`** (package bin). Aliases: `g` → `generate`, `c` → `console`, `r` → `routes`, `n` → `notes`.

| Command | Description |
|---------|-------------|
| `rails g <type> <name> [fields...]` | Run a generator (`cwd` = app root) |
| `rails routes` | Print route table (loads `configs/application`) |
| `rails console` | REPL with app context (`IRWIN_CONSOLE=1`) |
| `rails notes` | List `TODO`, `FIXME`, and `OPTIMIZE` comments (like `bin/rails notes`) |

### `rails notes`

Scans **`app/`**, **`configs/`**, **`lib/`**, and **`__tests__/`** for `.ts`, `.js`, and `.pug` files. Prints each match with file path and line number (color-coded by tag).

```bash
pnpm exec rails notes
# alias
pnpm exec rails n
```

### Generator syntax

```bash
pnpm exec rails g <type> <Name> [field:type ...] [--api]
```

**Namespaces:** `Admin/User`, `admin/user`, or `Admin:User` → files under `app/.../admin/`, routes in `configs/routes/admin/`.

**Field types** (for scaffold / resource / model):  
`string`, `text`, `integer`, `int`, `float`, `decimal`, `boolean`, `date`, `datetime`, `json`.

---

## Generators reference

| Type | Alias | Creates |
|------|-------|---------|
| `scaffold` | — | Controller, Pug views (unless `--api`), route in `configs/routes/`, optional Prisma hints |
| `resource` | — | API-style controller + route (`--api` same as scaffold API) |
| `controller` | — | Controller only (namespaced parent when applicable) |
| `service` | — | `*.service.ts` extending `ApplicationService` or `{Namespace}Service` |
| `model` | — | Appends Prisma model to `configs/db/schema.prisma` |
| `mailer` | — | Mailer extending `ApplicationMailer` |
| `job` | — | Job extending `ApplicationJob` (`static cron`, `perform`) |
| `channel` | — | Channel extending `ApplicationChannel` |
| `factory` | — | Test factory stub under `__tests__/factories/` |
| `concern` | — | Mixin object in `app/controllers/concerns/` |
| `test` | — | Jest stub from source file (`describe` / `it.todo` per public method) |

### Examples

```bash
# Full CRUD + views
pnpm exec rails g scaffold Product name:string price:decimal description:text

# API only
pnpm exec rails g resource Order total:decimal status:string --api

# Namespaced admin
pnpm exec rails g controller Admin/Dashboard

pnpm exec rails g service Payment/Process
pnpm exec rails g mailer UserNotification
pnpm exec rails g job SyncInventory
pnpm exec rails g channel Chat

pnpm exec rails g model Category name:string
pnpm exec rails g factory User
pnpm exec rails g concern Timestampable

# Tests (output: __tests__/.../*.test.ts)
pnpm exec rails g test app/controllers/home.controller.ts
pnpm exec rails g test app/services/auth/authLogin.service.ts
```

**Notes:**

- Routes are written to **`configs/routes/`**, not `app/routes`.
- Services inherit namespace base classes (`ApplicationService`, `AdminService`, …) created automatically when missing.
- `g scaffold` does not generate colocated `*.spec.ts`; use `g test` for Jest stubs.
- Redirects in generated controllers use template literals with correct paths.

---

## Related projects

| Repo | Role |
|------|------|
| [irwin-framework](../irwin-framework/) | Full reference application |
| [irwin-cli](../irwin-cli/) | `irwin new`, `irwin add <feature>` (planned) |
| **ts-rails** (this repo) | In-app runtime + `rails g` / `routes` / `console` / `notes` |

---

## License

MIT — developed by Hoan Pham and contributors.
