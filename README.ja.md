# ts-rails

**TypeScript と Express 向けの Rails スタイルアプリケーション層** — ルーティング、コントローラ、ジェネレータ、リアルタイムチャネル、メーラー、バックグラウンドジョブ、および Irwin エコシステム向けの共通ユーティリティ。

| 言語 | ドキュメント |
|------|----------------|
| English | [README.md](./README.md) |
| Tiếng Việt | [README.vi.md](./README.vi.md) |
| **日本語**（本書） | [README.ja.md](./README.ja.md) |

---

## 目次

1. [概要](#概要)
2. [インストール](#インストール)
3. [想定プロジェクト構成](#想定プロジェクト構成)
4. [ランタイムライブラリ](#ランタイムライブラリ)
5. [サブパス export](#サブパス-export)
6. [CLI](#cli)
7. [ジェネレータ一覧](#ジェネレータ一覧)
8. [関連プロジェクト](#関連プロジェクト)
9. [ライセンス](#ライセンス)

---

## 概要

`ts-rails` は **アプリ内フレームワーク**（プロジェクト全体のスキャフォールドツールではありません）。アプリケーションは次のように構成します。

- HTTP と Socket.IO のライフサイクル用に `RailsApplication` を継承する。
- `RailsRoute` でルートを宣言する（`resource()`、`action()`、権限、Swagger メタデータ）。
- ベースクラスの上にコントローラ、サービス、ジョブ、メーラー、チャネルを実装する。

| 領域 | 主な API |
|------|----------|
| Application | `RailsApplication`、`MiddlewareFactory`、`loadConcerns`、`bootstrap()`、`getRoutes()` |
| Routing | `RailsRoute`、`RestActions`、`action()`、`resource()` |
| Controller | `RailsController`、`@BeforeAction`、`@AfterAction`、ストロングパラメータ、`ApiResponse` |
| Real-time | `RailsChannel`、`channelClasses` による登録 |
| Mail | `RailsMailer`、`MailerAdapter` |
| Job | `RailsJob`、`JobAdapter`、`performLater()` |
| API ドキュメント | ルートの `document` から Swagger レジストリ |
| ユーティリティ | `logger`、`Cache`、ページネーション、ビューヘルパー、`AppError` 階層 |

**新規プロジェクト**や機能パック（`auth`、`admin` など）は **[irwin-cli](../irwin-cli/PLAN.md)**（計画中）を使用してください。本パッケージは **既存アプリ内のランタイムとジェネレータ** に焦点を当てます。

---

## インストール

```bash
npm install ts-rails
# または
yarn add ts-rails
# または
pnpm add ts-rails
```

### ピア依存関係

アプリで実際に使うピアをインストールしてください（コアには Express が必須。他は機能に応じて）:

| パッケージ | 用途 |
|------------|------|
| `express` | HTTP サーバー |
| `reflect-metadata`、`class-validator`、`class-transformer` | ストロングパラメータ / バリデーション |
| `cookie-parser`、`method-override` | 標準ミドルウェア |
| `socket.io` | チャネル |
| `nodemailer` | メーラー |
| `swagger-ui-express` | Swagger UI（アプリ側） |
| `dayjs` | ビューヘルパー `timeAgo` |
| `pluralize` | CLI ジェネレータ |
| `http-errors` | 404 / エラー処理 |

### CLI はローカルで実行

`rails` バイナリは本パッケージに含まれます。**アプリルートからローカルインストール経由で実行**してください（Windows でパスに空白がある場合、グローバル実行は失敗しやすいです）:

```bash
pnpm exec rails routes
pnpm exec rails g controller Posts
```

CLI は `app/controllers` が見つかるまで親ディレクトリをたどってアプリルートを解決します（`INIT_CWD`、`PNPM_SCRIPT_SRC_DIR`、`npm_config_local_prefix` も参照）。

---

## 想定プロジェクト構成

ジェネレータと規約は Irwin スタイルのツリーを前提とします:

```text
your-app/
├── app/
│   ├── controllers/          # CLI ルート検出に必須
│   ├── views/
│   ├── services/
│   ├── jobs/
│   ├── mailers/
│   └── channels/
├── configs/
│   ├── application.ts        # RailsApplication を継承
│   ├── routes/               # *.route.ts（app/ 外）
│   └── db/schema.prisma      # `g model` 用
└── __tests__/                # `g test` の出力 (*.test.ts)
```

---

## ランタイムライブラリ

### RailsApplication

`RailsApplication` は Express アプリ、標準ミドルウェア、ルートマウント、エラーハンドラ、HTTP サーバー、Socket.IO を管理します。

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
    // DB、セッション、メーラー、キャッシュなど
    this.bootstrap();
  }
}
```

**静的設定**（`bootstrap()` の前に設定）:

| プロパティ | 目的 |
|------------|------|
| `middlewareFactory` | `requestId`、`requestLogging`、`rateLimit`（必須） |
| `sessionMiddleware` | 任意。Socket.IO 認証チェーン用 |
| `mailerAdapter` | アプリ全体のメール送信 |
| `jobAdapter` | キュー（BullMQ など） |
| `jobClasses` | 登録ジョブクラス |
| `channelClasses` | Socket.IO チャネルクラス |
| `cacheStore` | アプリ全体キャッシュ |
| `loggerAdapter` | ロギング |
| `hasher` | パスワードハッシュ（`Security`） |

**ライフサイクル**（`bootstrap()` の順序）:

1. `setupStandardMiddlewares()` — JSON、Cookie、method override、`res.locals.h` 注入
2. `mountRoutes()` — サブクラスでオーバーライド
3. `getRoutes()` — イントロスペクション + Swagger パス登録
4. `setupSwagger()` — アプリでオーバーライド
5. `setupErrorHandlers()` — 404 + グローバル（`AppError`、API と HTML）
6. `startBackgroundProcessor()` — ワーカー用（Lambda / `IRWIN_CONSOLE` ではスキップ）

**Concerns** — コントローラプロトタイプに共通メソッドを混ぜ込む:

```typescript
this.loadConcerns(ApplicationController.prototype, "app/controllers/concerns");
```

### ルーティング（`RailsRoute`）

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
        summary: "ユーザー CRUD",
        body: CreateUserValidator,
      },
    });

    this.get("/profile", action(UsersController, "profile"));
  }
}
```

- **`resource()`** — REST 7 アクション（`only` / `except`、RBAC、`document` で OpenAPI）。
- **`action(Controller, "methodName")`** — コントローラメソッドをバインド（`@BeforeAction` / `@AfterAction` を実行）。
- **ファイルアップロード** — ルートに `upload` オプション（multer、制限、`fileFilter`）。

権限は `RailsRoute.permissionFactory` と `RailsRoute.actionPermissionMap` で接続します。

### コントローラ（`RailsController`）

| メソッド / プロパティ | 説明 |
|----------------------|------|
| `this.params(Validator).permit(...)` | params/query/body をマージ、`class-validator`、ホワイトリスト |
| `this.render(view, locals)` | Pug/EJS ビュー |
| `this.renderJson(data, status?)` | `ApiResponse` 経由の JSON |
| `this.redirect(path)` | HTTP リダイレクト |
| `this.flash(type, message)` | フラッシュミドルウェアが必要 |
| `this.io` | `req.app.get("io")` の Socket.IO |
| `this.t(key, options?)` | `res.locals.t` の i18n |

**フィルタ**（クラスデコレータ）:

```typescript
import { RailsController, BeforeAction, AfterAction } from "ts-rails";

@BeforeAction("authenticate", { except: ["index"] })
@AfterAction("logActivity", { only: ["create", "update"] })
export class UsersController extends RailsController {
  async authenticate() {
    if (!this.req.session?.userId) {
      this.res.status(401).json({ success: false, message: "Unauthorized" });
      return false; // チェーン停止
    }
  }
}
```

### ストロングパラメータ

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
  // 不正入力 → 422 UnprocessableEntityError
}
```

### API レスポンスとページネーション

```typescript
import { parsePagination, buildPaginatedResponse } from "ts-rails/pagination";

async index() {
  const { page, perPage, skip } = parsePagination(this.req.query);
  const [rows, total] = await fetchPage(skip, perPage);
  return this.renderJson(buildPaginatedResponse(rows, total, { page, perPage }));
}
```

### HTTP エラー

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "ts-rails/errors";
```

`RailsApplication` のエラーミドルウェアが処理します（`/api/*` は JSON、それ以外は HTML エラービュー）。

### リアルタイムチャネル（`RailsChannel`）

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

登録例:

```typescript
import * as channels from "@channels";
RailsApplication.channelClasses = Object.values(channels);
```

### メーラー（`RailsMailer`）

```typescript
export class UserMailer extends RailsMailer {
  static async welcome(user: { email: string; name: string }) {
    await this.deliver({
      to: user.email,
      subject: "ようこそ",
      html: `<p>こんにちは ${user.name}</p>`,
    });
  }
}
```

`RailsApplication.mailerAdapter` を設定するか、`ApplicationMailer` で `getTransporter()` をオーバーライドします。

### バックグラウンドジョブ（`RailsJob`）

```typescript
export class SyncDataJob extends RailsJob {
  async perform(payload: unknown) {
    // 処理
  }
}

await SyncDataJob.performLater({ id: 1 });
```

非同期キューには `RailsApplication.jobAdapter` を設定。生成ジョブは `ApplicationJob` を継承し、`static cron` で `node-cron` に対応可能。

### ビューヘルパー

テンプレートでは `h`（`res.locals.h`）として利用:

```typescript
import { viewHelpers as h } from "ts-rails";

h.timeAgo(new Date());
h.numberToCurrency(50000, "VND");
h.truncate("長い文字列", 20);
h.assetPath("javascripts/main.ts"); // 本番は Vite manifest
```

### Swagger

ルートの `document` で OpenAPI パスを登録。アプリの `setupSwagger()` で `setupSwaggerUI` を使用。`document.body` の Validator クラスは `class-validator` メタデータから JSON Schema にマップされます。

### ロガーとキャッシュ

```typescript
import { logger } from "ts-rails/logger";
import { Cache } from "ts-rails/cache";

logger.info("起動しました");
await Cache.set("key", value, { ttl: 3600 });
```

初期化で `RailsApplication.loggerAdapter` と `RailsApplication.cacheStore` を設定します。

---

## サブパス export

| import | モジュール |
|--------|------------|
| `ts-rails` | 公開 API 一式 |
| `ts-rails/logger` | ロガー |
| `ts-rails/cache` | キャッシュ |
| `ts-rails/errors` | HTTP エラークラス |
| `ts-rails/pagination` | `parsePagination`、`buildPaginatedResponse` |

---

## CLI

コマンド名: **`rails`**。エイリアス: `g` → `generate`、`c` → `console`、`r` → `routes`、`n` → `notes`。

| コマンド | 説明 |
|----------|------|
| `rails g <type> <name> [fields...]` | ジェネレータ実行（`cwd` = アプリルート） |
| `rails routes` | ルート一覧（`configs/application` を読み込み） |
| `rails console` | アプリコンテキスト付き REPL（`IRWIN_CONSOLE=1`） |
| `rails notes` | `TODO` / `FIXME` / `OPTIMIZE` コメント一覧（`bin/rails notes` と同様） |

### `rails notes`

**`app/`**、**`configs/`**、**`lib/`**、**`__tests__/`** 内の `.ts` / `.js` / `.pug` を走査し、タグごとに色分けしてパスと行番号を表示します。

```bash
pnpm exec rails notes
pnpm exec rails n
```

### ジェネレータ構文

```bash
pnpm exec rails g <type> <Name> [field:type ...] [--api]
```

**名前空間:** `Admin/User`、`admin/user`、`Admin:User` → `app/.../admin/`、`configs/routes/admin/`。

**フィールド型:**  
`string`、`text`、`integer`、`int`、`float`、`decimal`、`boolean`、`date`、`datetime`、`json`。

---

## ジェネレータ一覧

| type | 生成物 |
|------|--------|
| `scaffold` | コントローラ、Pug ビュー（`--api` 除く）、`configs/routes/` のルート |
| `resource` | API 向けコントローラ + ルート |
| `controller` | コントローラのみ |
| `service` | `ApplicationService` / `{Namespace}Service` を継承する `*.service.ts` |
| `model` | `configs/db/schema.prisma` に Prisma モデル追加 |
| `mailer` | `ApplicationMailer` を継承 |
| `job` | `ApplicationJob` を継承（`static cron`、`perform`） |
| `channel` | `ApplicationChannel` を継承 |
| `factory` | テスト用ファクトリ stub |
| `concern` | `app/controllers/concerns/` の mixin |
| `test` | ソースから Jest stub（public メソッドごとに `it.todo`） |

### 例

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

**注意:**

- ルートは **`configs/routes/`** に出力（`app/routes` ではない）。
- サービスは必要に応じて名前空間の基底クラスを自動作成。
- `g scaffold` は隣接 `*.spec.ts` を生成しない。`g test` を使用。
- 生成コードのリダイレクトはテンプレートリテラルで正しいパスを使用。

---

## 関連プロジェクト

| リポジトリ | 役割 |
|------------|------|
| [irwin-framework](../irwin-framework/) | 全機能のリファレンスアプリ |
| [irwin-cli](../irwin-cli/) | `irwin new`、`irwin add`（計画） |
| **ts-rails**（本リポジトリ） | アプリ内ランタイム + `rails g` / `routes` / `console` / `notes` |

---

## ライセンス

MIT — Hoan Pham およびコントリビューターにより開発。
