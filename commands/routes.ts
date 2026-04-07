import path from "path";
import fs from "fs";
import { RailsApplication, RouteInfo } from "../configs";

// Hỗ trợ nạp trực tiếp file .ts từ dự án
try {
  require("ts-node").register({
    transpileOnly: true,
  });
  // Hỗ trợ path aliases (@controllers, @lib...)
  require("tsconfig-paths").register();
} catch (e) {}

// 1. Tạm thời chặn logs để output sạch sẽ
const originalLog = console.log;
const originalInfo = console.info;
console.log = () => {};
console.info = () => {};

/**
 * Tự động tìm kiếm và nạp instance application từ dự án.
 * Ưu tiên:
 * 1. Biến môi trường APP_PATH
 * 2. Các đường dẫn phổ biến và kiểm tra inheritance (instanceof RailsApplication)
 */
const getApplication = () => {
  const root = process.cwd();
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
    // Kiểm tra file có tồn tại không trước khi require để tránh nuốt lỗi thực tế
    const resolvedPath = [".ts", ".js", "/index.ts", "/index.js", ""]
      .map(ext => appPath + ext)
      .find(p => fs.existsSync(p));

    if (!resolvedPath) continue;

    try {
      const mod = require(appPath);
      const app = mod.default || mod;

      // Kiểm tra Duck Typing thay vì instanceof để tránh lỗi đa tham chiếu (dual package hazard)
      const isInstance = app && typeof app.bootstrap === "function";
      const isClass = typeof app === "function" && app.prototype && typeof app.prototype.bootstrap === "function";

      if (isInstance) return app;
      if (isClass) return new app();
    } catch (err) {
      // Nếu file tồn tại mà lỗi load thì in lỗi ra để debug
      originalLog(`\x1b[31m[Error] Failed to load application at ${appPath}:\x1b[0m`);
      originalLog(err);
      process.exit(1);
    }
  }

  console.error(
    "Please ensure your application file exports an instance and is located in src/configs/application or configs/application.",
  );
  process.exit(1);
};

const application = getApplication();

// Chỉ khởi tạo phần routing và middleware cơ bản, không chạy initialize() để tránh cron/i18n
application.bootstrap();
// Yêu cầu parse lại router để lấy thông tin route list
const routes = application.getRoutes();

// 2. Khôi phục lại console để in kết quả
console.log = originalLog;
console.info = originalInfo;

// 3. Lấy từ khóa lọc từ tham số dòng lệnh hoặc biến môi trường (S hoặc SEARCH)
const searchTerm = (
  process.argv[2] ||
  process.env.S ||
  process.env.SEARCH ||
  ""
).toLowerCase();

const filteredRoutes = routes.filter((r: RouteInfo) => {
  const fullPath = `${r.prefix}${r.path}`.replace(/\/+/g, "/").toLowerCase();

  // Anh muốn hiển thị toàn bộ route http (không bao gồm api vì api đã có swagger)
  if (fullPath.includes("/api/")) return false;

  const method = r.method.toLowerCase();
  return (
    !searchTerm || fullPath.includes(searchTerm) || method.includes(searchTerm)
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
    GET: "\x1b[32m", // Green
    POST: "\x1b[33m", // Yellow
    PUT: "\x1b[34m", // Blue
    PATCH: "\x1b[36m", // Cyan
    DELETE: "\x1b[31m", // Red
  };
  const color = colors[methodStr] || "\x1b[0m"; // Mặc định là không màu
  const method = `${color}${methodStr.padEnd(7)}\x1b[0m`;

  let fullPath = `${r.prefix}${r.path}`.replace(/\/+/g, "/"); // Xóa bớt gạch chéo thừa //

  // Xóa dấu gạch chéo ở cuối nếu đường dẫn dài hơn 1 ký tự
  if (fullPath.length > 1 && fullPath.endsWith("/")) {
    fullPath = fullPath.slice(0, -1);
  }

  // Hiển thị Controller#Action nếu có
  let handler = "";
  if (r.controller && r.action) {
    handler = ` \x1b[90m=> ${r.controller.replace("Controller", "")}#${r.action}\x1b[0m`;
  }

  // In theo định dạng: [GET]    /admin/users  => AdminUsers#index
  console.info(`${method}\x1b[36m| \x1b[0m${fullPath.padEnd(40)}${handler}`);
});

console.info(
  `\nTotal: ${filteredRoutes.length} routes${searchTerm ? ` (filtered from ${routes.length})` : ""}\n`,
);
