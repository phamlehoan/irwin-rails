/** Chỉ dùng khi build package `rails` (tsconfig.build.json). Không merge vào app — app dùng typing-stubs/user. */
declare global {
  namespace Express {
    interface Request {
      user?: unknown | null;
      validated?: unknown;
      requestId?: string;
    }
  }
}

export {};
