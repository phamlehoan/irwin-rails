# ts-rails 🚂

**The Core Engine for TS Rails.**  
Hệ thống lõi cung cấp các tính năng mạnh mẽ tương tự Ruby on Rails cho hệ sinh thái Node.js, sử dụng TypeScript và Express.

---

## 🌟 Tính năng nổi bật

- 🚀 **Application**: Tích hợp sâu vào lõi Express.
- 🛣 **Routing Siêu Tốc**: Hỗ trợ `resource()` và helper `action()` để định nghĩa route nhanh chóng.
- 🎮 **Controller Decorators**: Sử dụng `@BeforeAction`, `@AfterAction` để quản lý luồng xử lý (Filters).
- 🔌 **Real-time Channels**: Tích hợp Socket.IO thông qua `RailsChannel` (giống ActionCable).
- 📮 **Unified Mailers**: Interface gửi mail đồng nhất với hệ thống Adapter linh hoạt.
- 📝 **Auto Swagger**: Tự động tạo tài liệu OpenAPI dựa trên khai báo route và validators.
- 🔢 **Pagination & Response**: Chuẩn hóa dữ liệu trả về và hỗ trợ phân trang chuẩn mực.
- 🖼 **View Helpers**: Hỗ trợ mạnh mẽ cho Pug/EJS với định dạng tiền tệ, thời gian và Vite assets.
- 👷 **Background Jobs**: Định nghĩa job chạy nền đồng nhất cho cả BullMQ và AWS Lambda.
- 🛠 **CLI Scaffolding**: Bộ generator mạnh mẽ giúp tạo code nhanh chóng.

---

## 📦 Cài đặt

Cài đặt thông qua các package manager yêu thích của bạn:

```bash
# npm
npm install ts-rails

# yarn
yarn add ts-rails

# pnpm
pnpm add ts-rails
```

---

## 🛠 Các thành phần chính

### 1. RailsApplication Core 🚂

`RailsApplication` là trái tim của hệ thống, quản lý toàn bộ vòng đời ứng dụng (Lifecycle), từ việc thiết lập cấu hình, nạp Initializers, quản lý Middleware cho đến khởi chạy Server và Socket.IO.

#### 1. Khởi tạo Application Class

Để bắt đầu, bạn cần kế thừa lớp `RailsApplication`. Đây là nơi bạn định nghĩa cách ứng dụng của mình khởi động.

```typescript
import { RailsApplication } from "ts-rails";
import { Route } from "./routes";

export class Application extends RailsApplication {
  constructor() {
    super();
    this.port = process.env.PORT || "8000";
  }

  // Gắn Router vào Express
  protected mountRoutes() {
    this.app.use("/", Route.draw());
  }

  // Khởi tạo các dịch vụ cần thiết (Database, Redis, etc.)
  public async initialize() {
    this.setupAppMiddlewares();
    await this.setupServices();
    this.bootstrap(); // Thiết lập server HTTP và Socket.IO
  }
}
```

#### 2. Middleware Factory Configuration

Framework cung cấp một `MiddlewareFactory` toàn cục để bạn có thể ghi đè hoặc bổ sung các middleware hệ thống (như Rate Limit, Request Logging) bằng logic tùy chỉnh của mình.

```typescript
import { RailsApplication, MiddlewareFactory } from "ts-rails";
import { rateLimitMiddleware } from "@middlewares/rateLimit.middleware";
import { requestIdMiddleware } from "@middlewares/requestId.middleware";

RailsApplication.middlewareFactory = {
  rateLimit: rateLimitMiddleware,
  requestId: () => requestIdMiddleware,
  requestLogging: () => (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  },
} as MiddlewareFactory;
```

#### 3. Quản lý Controller Concerns (Mixins)

Tương tự như Ruby on Rails, bạn có thể sử dụng `loadConcerns` để "nhúng" các hàm dùng chung vào Controller mà không cần kế thừa phức tạp.

```typescript
import { ApplicationController } from "@controllers/application.controller";

// Trong phương thức initialize() của Application class:
this.loadConcerns(
  ApplicationController.prototype,
  "app/controllers/concerns", // Đường dẫn tới thư mục chứa các file .ts concern
);
```

_Ví dụ: Nếu bạn có file `rescuable.ts` trong thư mục concerns, các phương thức trong đó sẽ tự động xuất hiện trong `ApplicationController`._

#### 4. Socket.IO Channels

Đăng ký tất cả các lớp Channel để sử dụng tính năng Real-time:

```typescript
import * as channels from "@channels";

RailsApplication.channelClasses = Object.values(channels);
```

#### 5. Background Processing (BullMQ)

Framework hỗ trợ xử lý tác vụ chạy nền. Bạn có thể override `startBackgroundProcessor` để khởi chạy Worker:

```typescript
protected startBackgroundProcessor() {
  // Logic setup BullMQ Worker hoặc các trình xử lý hàng đợi khác
  setupBullMQWorker();
}
```

#### 6. Vòng đời khởi chạy (Full Lifecycle)

Dưới đây là thứ tự chuẩn để chạy ứng dụng:

```typescript
export class Application extends RailsApplication {
  // ... các phương thức setupConfig, setupViewEngine ...

  public async run() {
    // 1. Chạy các Initializers (Logger, Mailer, Cache...)
    initializeLogger();
    initializeMailer();

    // 2. Setup view engine & static files
    this.app.set("view engine", "pug");

    // 3. Khởi tạo hệ thống
    await this.initialize();

    // 4. Start Server
    super.run();
  }
}

const app = new Application();
app.run();
```

#### 📄 Ghi chú

Mọi cấu hình mặc định có thể được tùy chỉnh thông qua việc override các phương thức `protected` trong lớp `RailsApplication`.

### 2. Resourceful Routing & `action()`

Không còn phải khai báo từng route thủ công. Kết nối trực tiếp Route với Controller Class:

```typescript
import { RailsRoute, action } from "ts-rails";
import { UsersController } from "../controllers/users.controller";

export class AppRoute extends RailsRoute {
  draw(): void {
    / Tạo ra 7 routes tiêu chuẩn (index, show, create, update, destroy, ...)
    this.resource("/users", UsersController, {
      only: ["index", "show", "create"],
      setPermissionFor: "USER_MANAGEMENT",
    });

    // Sử dụng helper action() cho các route tùy chỉnh
    this.get("/profile", action(UsersController, "profile"));
  }
}
```

### 4. Strong Parameters & Validation

Thư viện hỗ trợ cơ chế bảo mật tham số đầu vào (Whitelist) kết hợp với `class-validator` để tự động kiểm tra và chuyển đổi kiểu dữ liệu.

#### Bước 1: Định nghĩa Validator Class

```typescript
import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";

export class CreateUserValidator {
  @IsEmail({}, { message: "Email không hợp lệ" })
  email: string;

  @IsString()
  @MinLength(3, { message: "Tên phải có ít nhất 3 ký tự" })
  name: string;

  @IsString()
  @IsOptional()
  bio?: string;
}
```

#### Bước 2: Sử dụng trong Controller

```typescript
import { RailsController } from "ts-rails";
import { CreateUserValidator } from "../validators/user.validator";

export class UsersController extends RailsController {
  async create() {
    /**
     * this.params(Validator) thực hiện:
     * 1. Validate dữ liệu từ request body/query dựa trên class-validator.
     * 2. Tự động trả về lỗi 422 nếu dữ liệu không hợp lệ.
     * 3. .permit(...) whitelist các trường được phép nhận.
     */
    const userParams = await this.params(CreateUserValidator).permit(
      "email",
      "name",
      "bio",
    );

    // userParams đã được validate và lọc sạch
    const user = await UserService.create(userParams);
    return this.renderJson(user);
  }
}
```

### 5. Controller Filters & Decorators

Quản lý logic tiền xử lý và hậu xử lý cực kỳ dễ dàng:

```typescript
import { RailsController, BeforeAction, AfterAction } from "ts-rails";

@BeforeAction("authenticate", { except: ["index"] })
@AfterAction("logActivity", { only: ["create", "update"] })
export class UsersController extends RailsController {
  async authenticate() {
    if (!this.req.session.userId) return this.renderError(401, "Unauthorized");
  }

  // ... logic xử lý các action khác
}
```

### 6. File Upload Validation

Tích hợp sẵn middleware xử lý upload và kiểm tra ràng buộc file ngay trong cấu hình route.

```typescript
this.resource("/products", ProductsController, {
  upload: {
    fields: [
      { name: "thumbnail", maxCount: 1 },
      { name: "gallery", maxCount: 5 },
    ],
    limits: {
      fileSize: 5 * 1024 * 1024, // Giới hạn 5MB cho mỗi file
    },
    fileFilter: (req, file, cb) => {
      // Chỉ cho phép file ảnh
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Chỉ chấp nhận định dạng hình ảnh!"), false);
      }
      cb(null, true);
    },
  },
});
```

### 7. Real-time Channels (Socket.IO)

Khai báo channel theo hướng đối tượng:

```typescript
import { RailsChannel } from "ts-rails";

export class ChatChannel extends RailsChannel {
  subscribe() {
    this.on("message", (data) => {
      this.broadcast("room_1", { content: data });
    });
  }
}
```

### 8. View Helpers (Time, Currency, Vite)

Cung cấp sẵn bộ `viewHelpers` để sử dụng trong các template engine:

```typescript
import { viewHelpers as h } from "ts-rails";

h.timeAgo(Date.now()); // "a few seconds ago"
h.numberToCurrency(50000); // "50.000 ₫"
h.assetPath("main.ts"); // Tự động nhận diện path từ Vite manifest
```

### 9. Mailers & Custom Adapters

Hệ thống Mailer hoạt động theo mô hình Adapter, cho phép bạn linh hoạt thay đổi dịch vụ gửi mail mà không làm thay đổi code business.

#### Bước 1: Triển khai Adapter (Ví dụ: Gmail OAuth2)

```typescript
import { MailerAdapter } from "ts-rails";
import { createTransport } from "nodemailer";

export class GmailOAuth2Adapter implements MailerAdapter {
  async sendMail(options: any): Promise<void> {
    const transporter = createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_FROM,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      },
    });

    await transporter.sendMail({
      ...options,
      from: options.from || this.getDefaultFromAddress(),
    });
  }

  getDefaultFromAddress(): string {
    return `TS Rails App <${process.env.EMAIL_FROM}>`;
  }
}
```

#### Bước 2: Đăng ký Adapter trong Initializer

```typescript
import { RailsApplication } from "ts-rails";
import { GmailOAuth2Adapter } from "./mail/gmail-oauth2.adapter";

// Cấu hình thường đặt trong configs/initializers/mailer.ts
RailsApplication.mailerAdapter = new GmailOAuth2Adapter();
```

#### Bước 3: Định nghĩa và sử dụng Mailer

```typescript
import { RailsMailer } from "ts-rails";

export class UserMailer extends RailsMailer {
  static async welcome(user: any) {
    await this.deliver({
      to: user.email,
      subject: "Welcome to TS Rails!",
      template: "mailers/welcome",
      locals: { name: user.name },
    });
  }
}
```

### 10. Pagination & Standardized Response

```typescript
import { parsePagination, buildPaginatedResponse } from "ts-rails";

async index() {
  const { page, perPage, skip } = parsePagination(this.req.query);
  const [data, total] = await db.user.findManyAndCount({ skip, take: perPage });

  return this.renderJson(buildPaginatedResponse(data, total, { page, perPage }));
}
```

---

## ⚙️ Cấu hình & Tiện ích

### Swagger Configuration

Tự động quét và tạo tài liệu API:

```typescript
this.resource("/api/users", UsersController, {
  document: {
    body: CreateUserValidator,
    summary: "Tạo người dùng mới",
    tags: ["User Management"],
  },
});
```

### Logger & Cache

Sử dụng interface đồng nhất cho toàn hệ thống:

```typescript
import { logger } from "ts-rails";
import { Cache } from "ts-rails";

logger.info("Server started");
await Cache.set("key", value, { ttl: 3600 });
```

---

## 💻 CLI Commands

Sử dụng command `rails` để sinh mã nguồn nhanh chóng theo chuẩn `field:type`.

**Cú pháp:**  
`npx rails generate <loại> <TênModel> [field:type field:type ...]`

### Các lệnh chính:

| Lệnh           | Mô tả                                         | Ví dụ                                                              |
| :------------- | :-------------------------------------------- | :----------------------------------------------------------------- |
| `g scaffold`   | Tạo trọn bộ: Model, Controller, Views, Routes | `npx rails g scaffold Product name:string price:integer desc:text` |
| `g resource`   | Tạo API Resource (Controller + Model)         | `npx rails g resource Order total:decimal status:string`           |
| `g controller` | Tạo Controller mới                            | `npx rails g controller Admin/Dashboard`                           |
| `g service`    | Tạo Service xử lý logic                       | `npx rails g service Payment`                                      |
| `g mailer`     | Tạo class Mailer                              | `npx rails g mailer Notification`                                  |
| `g job`        | Tạo Background Job                            | `npx rails g job SyncData`                                         |
| `g channel`    | Tạo Socket.IO Channel                         | `npx rails g channel Chat`                                         |

**Các kiểu dữ liệu hỗ trợ:**  
`string`, `text`, `integer`, `float`, `decimal`, `boolean`, `date`, `datetime`, `json`.

---

## 📄 License

MIT

---

_Phát triển bởi Hoan Pham và cộng đồng._
