# ts-rails

**Lớp ứng dụng kiểu Rails cho TypeScript và Express** — routing, controller, generator, channel real-time, mailer, background job và tiện ích dùng chung cho hệ sinh thái Irwin.

| Ngôn ngữ | Tài liệu |
|----------|----------|
| English | [README.md](./README.md) |
| **Tiếng Việt** (tài liệu này) | [README.vi.md](./README.vi.md) |
| 日本語 | [README.ja.md](./README.ja.md) |

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Cài đặt](#cài-đặt)
3. [Cấu trúc project mong đợi](#cấu-trúc-project-mong-đợi)
4. [Thư viện runtime](#thư-viện-runtime)
5. [Subpath exports](#subpath-exports)
6. [CLI](#cli)
7. [Tham chiếu generator](#tham-chiếu-generator)
8. [Repo liên quan](#repo-liên-quan)
9. [Giấy phép](#giấy-phép)

---

## Tổng quan

`ts-rails` là **framework chạy trong app** (không phải công cụ tạo project đầy đủ). Ứng dụng của anh:

- Kế thừa `RailsApplication` cho vòng đời HTTP + Socket.IO.
- Khai báo route bằng `RailsRoute` (`resource()`, `action()`, phân quyền, metadata Swagger).
- Triển khai controller, service, job, mailer, channel trên các lớp cơ sở.

| Khối | API chính |
|------|-----------|
| Application | `RailsApplication`, `MiddlewareFactory`, `loadConcerns`, `bootstrap()`, `getRoutes()` |
| Routing | `RailsRoute`, `RestActions`, `action()`, `resource()` |
| Controller | `RailsController`, `@BeforeAction`, `@AfterAction`, strong params, `ApiResponse` |
| Real-time | `RailsChannel`, đăng ký qua `channelClasses` |
| Mail | `RailsMailer`, `MailerAdapter` |
| Job | `RailsJob`, `JobAdapter`, `performLater()` |
| Tài liệu API | Registry Swagger từ `document` trên route |
| Tiện ích | `logger`, `Cache`, phân trang, view helpers, nhóm `AppError` |

Để **tạo project mới** và gói tính năng (`auth`, `admin`, …), dùng **[irwin-cli](../irwin-cli/PLAN.md)** (đang lên kế hoạch). Package này tập trung **runtime + generator trong app có sẵn**.

---

## Cài đặt

```bash
npm install ts-rails
# hoặc
yarn add ts-rails
# hoặc
pnpm add ts-rails
```

### Peer dependencies

Cài các peer mà app thực sự dùng (Express bắt buộc cho core; các package khác tùy tính năng):

| Package | Dùng cho |
|---------|----------|
| `express` | HTTP server |
| `reflect-metadata`, `class-validator`, `class-transformer` | Strong params / validation |
| `cookie-parser`, `method-override` | Middleware chuẩn |
| `socket.io` | Channel |
| `nodemailer` | Mailer |
| `swagger-ui-express` | Swagger UI (trong app) |
| `dayjs` | View helper `timeAgo` |
| `pluralize` | CLI generator |
| `http-errors` | Xử lý 404 / lỗi |

### Chạy CLI local

Binary **`rails`** đi kèm package. **Luôn chạy từ thư mục gốc app** qua bản cài local (trên Windows, đường dẫn có khoảng trắng dễ lỗi nếu dùng global):

```bash
pnpm exec rails routes
pnpm exec rails g controller Posts
```

CLI tìm app root bằng cách đi lên thư mục cha cho đến khi thấy `app/controllers` (cũng tôn trọng `INIT_CWD`, `PNPM_SCRIPT_SRC_DIR`, `npm_config_local_prefix`).

---

## Cấu trúc project mong đợi

Generator và convention theo layout kiểu Irwin:

```text
your-app/
├── app/
│   ├── controllers/          # bắt buộc để CLI nhận diện root
│   ├── views/
│   ├── services/
│   ├── jobs/
│   ├── mailers/
│   └── channels/
├── configs/
│   ├── application.ts        # class kế thừa RailsApplication
│   ├── routes/               # *.route.ts (không đặt trong app/)
│   └── db/schema.prisma      # dùng cho `g model`
└── __tests__/                # output của `g test` (*.test.ts)
```

---

## Thư viện runtime

### RailsApplication

`RailsApplication` quản lý Express, middleware chuẩn, mount route, error handler, HTTP server và Socket.IO.

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
    // DB, session, mailer, cache...
    this.bootstrap();
  }
}
```

**Cấu hình static** (gán trước `bootstrap()`):

| Thuộc tính | Mục đích |
|------------|----------|
| `middlewareFactory` | `requestId`, `requestLogging`, `rateLimit` (bắt buộc) |
| `sessionMiddleware` | Tuỳ chọn; dùng cho chuỗi auth Socket.IO |
| `mailerAdapter` | Gửi mail toàn app |
| `jobAdapter` | Hàng đợi (BullMQ, …) |
| `jobClasses` | Danh sách job đăng ký |
| `channelClasses` | Class channel Socket.IO |
| `cacheStore` | Cache toàn app |
| `loggerAdapter` | Logging |
| `hasher` | Băm mật khẩu (`Security`) |

**Vòng đời** (`bootstrap()`):

1. `setupStandardMiddlewares()` — JSON, cookie, method override, inject `res.locals.h`
2. `mountRoutes()` — override ở subclass
3. `getRoutes()` — introspection + đăng ký path Swagger
4. `setupSwagger()` — override trong app
5. `setupErrorHandlers()` — 404 + handler toàn cục (`AppError`, API vs HTML)
6. `startBackgroundProcessor()` — override cho worker (bỏ qua trên Lambda / `IRWIN_CONSOLE`)

**Concerns** — trộn method dùng chung vào prototype controller:

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
        summary: "CRUD người dùng",
        body: CreateUserValidator,
      },
    });

    this.get("/profile", action(UsersController, "profile"));
  }
}
```

- **`resource()`** — 7 action REST (`index`, `show`, `new`, `create`, `edit`, `update`, `destroy`) với `only` / `except`, RBAC (`setPermissionFor`, `setPermissionForAny`), OpenAPI `document`.
- **`action(Controller, "methodName")`** — gắn method controller (chạy filter `@BeforeAction` / `@AfterAction`).
- **Upload file** — tuỳ chọn `upload` trên route (multer, giới hạn, `fileFilter`).

Gắn permission qua `RailsRoute.permissionFactory` và `RailsRoute.actionPermissionMap`.

### Controller (`RailsController`)

| Method / thuộc tính | Mô tả |
|---------------------|--------|
| `this.params(Validator).permit(...)` | Gộp params/query/body, validate `class-validator`, whitelist |
| `this.render(view, locals)` | View Pug/EJS |
| `this.renderJson(data, status?)` | JSON `{ success: true, data }` qua `ApiResponse` |
| `this.redirect(path)` | Redirect HTTP |
| `this.flash(type, message)` | Cần middleware flash |
| `this.io` | Socket.IO từ `req.app.get("io")` |
| `this.t(key, options?)` | i18n từ `res.locals.t` |

**Filter** (decorator class):

```typescript
import { RailsController, BeforeAction, AfterAction } from "ts-rails";

@BeforeAction("authenticate", { except: ["index"] })
@AfterAction("logActivity", { only: ["create", "update"] })
export class UsersController extends RailsController {
  async authenticate() {
    if (!this.req.session?.userId) {
      this.res.status(401).json({ success: false, message: "Unauthorized" });
      return false; // dừng chuỗi filter
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
  // Dữ liệu sai → 422 UnprocessableEntityError
}
```

### Response API & phân trang

```typescript
import { parsePagination, buildPaginatedResponse } from "ts-rails/pagination";

async index() {
  const { page, perPage, skip } = parsePagination(this.req.query);
  const [rows, total] = await fetchPage(skip, perPage);
  return this.renderJson(buildPaginatedResponse(rows, total, { page, perPage }));
}
```

### Lỗi HTTP

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "ts-rails/errors";
```

Lỗi được middleware của `RailsApplication` xử lý (JSON với `/api/*`, view lỗi HTML còn lại).

### Channel real-time (`RailsChannel`)

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

Đăng ký:

```typescript
import * as channels from "@channels";
RailsApplication.channelClasses = Object.values(channels);
```

### Mailer (`RailsMailer`)

```typescript
export class UserMailer extends RailsMailer {
  static async welcome(user: { email: string; name: string }) {
    await this.deliver({
      to: user.email,
      subject: "Chào mừng",
      html: `<p>Xin chào ${user.name}</p>`,
    });
  }
}
```

Cấu hình `RailsApplication.mailerAdapter` hoặc override `getTransporter()` trên `ApplicationMailer`.

### Background job (`RailsJob`)

```typescript
export class SyncDataJob extends RailsJob {
  async perform(payload: unknown) {
    // xử lý
  }
}

await SyncDataJob.performLater({ id: 1 });
```

Cấu hình `RailsApplication.jobAdapter` cho hàng đợi. Job sinh ra kế thừa `ApplicationJob`, có thể đặt `static cron` cho `node-cron`.

### View helpers

Inject vào template qua `h` (`res.locals.h`):

```typescript
import { viewHelpers as h } from "ts-rails";

h.timeAgo(new Date());
h.numberToCurrency(50000, "VND");
h.truncate("chuỗi dài", 20);
h.assetPath("javascripts/main.ts"); // Vite manifest ở production
```

### Swagger

Route dùng `action(Controller, "method")` **tự đăng ký Swagger** (không bắt buộc `document`):

- **Body (POST/PUT/PATCH):** suy từ `this.params(Validator)` trong action — đọc tên class + `.permit('field', …)` trong source.
- **Path `{id}` / `:id`:** tự sinh parameter `in: path`.
- **Query string (heuristic):** suy từ `req.query.foo` kèm `if (!foo)` trong action → `in: query`. Trường hợp phức tạp hơn: dùng `document.params` trên route hoặc `@ApiDoc({ params: { token: 'string' } })` trên controller method.
- **POST không suy được body:** hiển thị JSON object trống (`additionalProperties`) để vẫn có ô nhập trên Swagger UI.
- **`document` trên route** (hoặc shorthand `body`/`params`/`tags`…) **ghi đè** phần suy tự động.

Chi tiết khi cần override:

- `document.body` / `document.params`: truyền **Validator class** → ts-rails tự suy schema từ `class-validator` (field không `@IsOptional()` = required).
- Nếu Validator có `static schema` / `static required` → **ưu tiên** config đó, phần còn thiếu bổ sung từ metadata.
- Shorthand `{ email: "string" }` vẫn dùng được như override thuần.
- `document.requestBody`: OpenAPI requestBody đầy đủ (ưu tiên cao nhất).
- `resource()`: `document` mặc định + `documentByAction` ghi đè theo action (`create`, `index`, …).

### Logger & cache

```typescript
import { logger } from "ts-rails/logger";
import { Cache } from "ts-rails/cache";

logger.info("đã khởi động");
await Cache.set("key", value, { ttl: 3600 });
```

Gán `RailsApplication.loggerAdapter` và `RailsApplication.cacheStore` trong initializer.

---

## Subpath exports

| Import | Module |
|--------|--------|
| `ts-rails` | API public đầy đủ |
| `ts-rails/logger` | Logger |
| `ts-rails/cache` | Cache |
| `ts-rails/errors` | Class lỗi HTTP |
| `ts-rails/pagination` | `parsePagination`, `buildPaginatedResponse` |

---

## CLI

Tên lệnh: **`rails`**. Alias: `g` → `generate`, `c` → `console`, `r` → `routes`, `n` → `notes`.

| Lệnh | Mô tả |
|------|--------|
| `rails g <type> <name> [fields...]` | Chạy generator (`cwd` = app root) |
| `rails routes` | In bảng route (load `configs/application`) |
| `rails console` | REPL với context app (`IRWIN_CONSOLE=1`) |
| `rails notes` | Liệt kê comment `TODO`, `FIXME`, `OPTIMIZE` (tương tự `bin/rails notes`) |

### `rails notes`

Quét **`app/`**, **`configs/`**, **`lib/`**, **`__tests__/`** — file `.ts`, `.js`, `.pug`. In từng dòng kèm đường dẫn và số dòng (màu theo tag).

```bash
pnpm exec rails notes
pnpm exec rails n
```

### Cú pháp generator

```bash
pnpm exec rails g <type> <Tên> [field:type ...] [--api]
```

**Namespace:** `Admin/User`, `admin/user`, hoặc `Admin:User` → file dưới `app/.../admin/`, route trong `configs/routes/admin/`.

**Kiểu field:**  
`string`, `text`, `integer`, `int`, `float`, `decimal`, `boolean`, `date`, `datetime`, `json`.

---

## Tham chiếu generator

| Type | Tạo ra |
|------|--------|
| `scaffold` | Controller, view Pug (trừ `--api`), route trong `configs/routes/` |
| `resource` | Controller + route kiểu API |
| `controller` | Chỉ controller (parent namespace nếu có) |
| `service` | `*.service.ts` kế thừa `ApplicationService` / `{Namespace}Service` |
| `model` | Thêm model Prisma vào `configs/db/schema.prisma` |
| `mailer` | Mailer kế thừa `ApplicationMailer` |
| `job` | Job kế thừa `ApplicationJob` (`static cron`, `perform`) |
| `channel` | Channel kế thừa `ApplicationChannel` |
| `factory` | Factory stub test |
| `concern` | Mixin trong `app/controllers/concerns/` |
| `test` | Stub Jest từ file nguồn (`describe` / `it.todo` theo method public) |

### Ví dụ

```bash
pnpm exec rails g scaffold Product name:string price:decimal description:text
pnpm exec rails g resource Order total:decimal status:string --api
pnpm exec rails g controller Admin/Dashboard
pnpm exec rails g service Payment/Process
pnpm exec rails g mailer UserNotification
pnpm exec rails g job SyncInventory
pnpm exec rails g channel Chat
pnpm exec rails g model Category name:string
pnpm exec rails g factory User
pnpm exec rails g concern Timestampable
pnpm exec rails g test app/controllers/home.controller.ts
```

**Lưu ý:**

- Route ghi vào **`configs/routes/`**, không phải `app/routes`.
- Service tự tạo lớp cha namespace nếu chưa có.
- `g scaffold` không sinh `*.spec.ts` cạnh file; dùng `g test`.
- Redirect trong code sinh ra dùng template literal đúng đường dẫn.

---

## Repo liên quan

| Repo | Vai trò |
|------|---------|
| [irwin-framework](../irwin-framework/) | App tham chiếu đầy đủ tính năng |
| [irwin-cli](../irwin-cli/) | `irwin new`, `irwin add` (kế hoạch) |
| **ts-rails** (repo này) | Runtime trong app + `rails g` / `routes` / `console` / `notes` |

---

## Giấy phép

MIT — phát triển bởi Hoan Pham và cộng đồng.
