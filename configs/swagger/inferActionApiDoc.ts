import "reflect-metadata";
import type { ApiDocOptions } from "./decorator";
import { resolveFieldSchema, type SchemaShorthand } from "./validatorSchema";
import { findValidatorClass } from "./validatorRegistry";

const ACTION_API_DOC_KEY = "irwin:actionApiDoc";

export function setActionApiDoc(
  target: object,
  propertyKey: string | symbol,
  options: ApiDocOptions,
): void {
  const existing =
    (Reflect.getMetadata(ACTION_API_DOC_KEY, target, propertyKey) as
      | ApiDocOptions
      | undefined) ?? {};
  Reflect.defineMetadata(
    ACTION_API_DOC_KEY,
    { ...existing, ...options },
    target,
    propertyKey,
  );
}

export function getActionApiDoc(
  Controller: new (...args: any[]) => any,
  actionName: string,
): ApiDocOptions | undefined {
  const proto = Controller.prototype;
  if (!proto || typeof proto[actionName] !== "function") return undefined;
  return Reflect.getMetadata(ACTION_API_DOC_KEY, proto, actionName) as
    | ApiDocOptions
    | undefined;
}

/** Decorator trên controller action — bổ sung/override Swagger khi route không có `document`. */
export function ApiDoc(options: ApiDocOptions) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    setActionApiDoc(target, propertyKey, options);
    return descriptor;
  };
}

function getMethodSource(
  Controller: new (...args: any[]) => any,
  actionName: string,
): string {
  const fn = Controller.prototype?.[actionName];
  if (typeof fn !== "function") return "";
  return Function.prototype.toString.call(fn);
}

function inferParamsValidatorFromSource(source: string): {
  validatorName: string;
  permitFields?: string[];
} | undefined {
  const match = source.match(/\.params\(\s*([A-Za-z0-9_]+)\s*\)/);
  if (!match) return undefined;

  const permitMatch = source.match(/\.permit\(\s*([\s\S]*?)\s*\)/);
  const permitFields = permitMatch
    ? [...permitMatch[1].matchAll(/['"](\w+)['"]/g)].map((m) => m[1])
    : undefined;

  return { validatorName: match[1], permitFields };
}

function inferQueryParamsFromSource(source: string): {
  params: SchemaShorthand;
  requiredParams: string[];
} {
  const params: SchemaShorthand = {};
  const names = new Set<string>();

  for (const match of source.matchAll(/(?:this\.)?req\.query\.(\w+)/g)) {
    names.add(match[1]);
    params[match[1]] = "string";
  }

  const requiredParams: string[] = [];
  for (const name of names) {
    if (new RegExp(`if\\s*\\(\\s*!\\s*${name}\\b`).test(source)) {
      requiredParams.push(name);
    }
  }

  return { params, requiredParams };
}

function bodyFromValidator(
  Validator: new (...args: any[]) => object,
  permitFields?: string[],
): Pick<ApiDocOptions, "body" | "requiredBody"> {
  const resolved = resolveFieldSchema(Validator);
  if (!resolved.shorthand || !Object.keys(resolved.shorthand).length) {
    return { body: Validator };
  }

  if (!permitFields?.length) {
    return {
      body: Validator,
      requiredBody: resolved.required,
    };
  }

  const filtered: SchemaShorthand = {};
  for (const field of permitFields) {
    if (resolved.shorthand[field]) {
      filtered[field] = resolved.shorthand[field];
    }
  }

  return {
    body: Object.keys(filtered).length ? filtered : Validator,
    requiredBody: permitFields,
  };
}

/**
 * Suy Swagger từ controller action khi route không khai báo `document`.
 * - `this.params(Validator)` → request body (POST/PUT/PATCH) hoặc query (GET)
 * - `req.query.foo` + `if (!foo)` → query param
 * - `@ApiDoc()` trên method → ưu tiên cao hơn suy luận
 */
export function inferActionApiDoc(
  Controller: new (...args: any[]) => any,
  actionName: string,
  httpMethod: string,
  _swaggerPath: string,
): ApiDocOptions {
  const fromDecorator = getActionApiDoc(Controller, actionName);
  const source = getMethodSource(Controller, actionName);
  const inferred: ApiDocOptions = {};

  const validatorInfo = inferParamsValidatorFromSource(source);
  if (validatorInfo) {
    const Validator = findValidatorClass(validatorInfo.validatorName);
    if (Validator) {
      const bodyDoc = bodyFromValidator(Validator, validatorInfo.permitFields);
      if (["post", "put", "patch"].includes(httpMethod)) {
        inferred.body = bodyDoc.body;
        inferred.requiredBody = bodyDoc.requiredBody;
      } else if (httpMethod === "get") {
        inferred.params = bodyDoc.body;
        inferred.requiredParams = bodyDoc.requiredBody;
      }
    }
  }

  const query = inferQueryParamsFromSource(source);
  if (Object.keys(query.params).length) {
    inferred.params = {
      ...((inferred.params as SchemaShorthand | undefined) ?? {}),
      ...query.params,
    };
    if (query.requiredParams.length) {
      inferred.requiredParams = [
        ...new Set([
          ...(inferred.requiredParams ?? []),
          ...query.requiredParams,
        ]),
      ];
    }
  }

  if (!fromDecorator) return inferred;
  return { ...inferred, ...fromDecorator };
}

export function mergeApiDocOptions(
  base: ApiDocOptions | undefined,
  override: ApiDocOptions | undefined,
): ApiDocOptions {
  if (!base) return override ?? {};
  if (!override) return base;
  return { ...base, ...override };
}

export function defaultJsonRequestBody(): Record<string, unknown> {
  return {
    required: false,
    content: {
      "application/json": {
        schema: { type: "object", additionalProperties: true },
      },
    },
  };
}
