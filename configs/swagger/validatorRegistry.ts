import { isValidatorClass, type ValidatorCtor } from "./validatorTypes";

const validatorRegistry = new Map<string, ValidatorCtor>();

/** Đăng ký Validator class để suy Swagger từ tên (vd. `LoginValidator`). */
export function registerValidatorClass(cls: ValidatorCtor): void {
  if (!cls?.name || !isValidatorClass(cls)) return;
  validatorRegistry.set(cls.name, cls);
}

/** Tìm Validator class theo tên — registry trước, sau đó quét module đã load. */
export function findValidatorClass(name: string): ValidatorCtor | undefined {
  const cached = validatorRegistry.get(name);
  if (cached) return cached;

  const fromModules = scanLoadedModulesForValidator(name);
  if (fromModules) {
    registerValidatorClass(fromModules);
    return fromModules;
  }

  return undefined;
}

function scanLoadedModulesForValidator(name: string): ValidatorCtor | undefined {
  if (typeof require === "undefined") return undefined;

  const cache = (require as NodeRequire).cache;
  if (!cache) return undefined;

  for (const mod of Object.values(cache)) {
    const exp = mod?.exports;
    if (!exp) continue;

    const candidates: unknown[] =
      typeof exp === "object" && exp !== null
        ? [exp, ...Object.values(exp as Record<string, unknown>)]
        : [exp];

    for (const candidate of candidates) {
      if (
        typeof candidate === "function" &&
        candidate.name === name &&
        isValidatorClass(candidate)
      ) {
        return candidate as ValidatorCtor;
      }
    }
  }

  return undefined;
}
