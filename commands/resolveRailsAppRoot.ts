import fs from "fs";
import path from "path";

/** Project root when `app/controllers` exists (Irwin / ts-rails layout). */
export function resolveRailsAppRoot(): string {
  const candidates = new Set<string>();
  const tryAdd = (p: string | undefined) => {
    if (!p) return;
    try {
      candidates.add(path.resolve(p));
    } catch {
      /* ignore */
    }
  };
  tryAdd(process.env.INIT_CWD);
  tryAdd(process.env.PNPM_SCRIPT_SRC_DIR);
  tryAdd(process.env.npm_config_local_prefix);
  tryAdd(process.cwd());

  for (const start of candidates) {
    let dir = start;
    for (;;) {
      try {
        if (fs.existsSync(path.join(dir, "app", "controllers"))) return dir;
      } catch {
        /* ignore */
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}
