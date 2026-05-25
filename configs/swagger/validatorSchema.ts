import "reflect-metadata";
import { getMetadataStorage } from "class-validator";
import { registerValidatorClass } from "./validatorRegistry";
import {
  isValidatorClass,
  type SchemaShorthand,
  type ValidatorCtor,
} from "./validatorTypes";

export type { SchemaShorthand, ValidatorCtor } from "./validatorTypes";
export { isValidatorClass } from "./validatorTypes";

export type OpenApiObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export function isOpenApiObjectSchema(value: unknown): value is OpenApiObjectSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as OpenApiObjectSchema).type === "object" &&
    typeof (value as OpenApiObjectSchema).properties === "object"
  );
}

export function isSchemaShorthand(value: unknown): value is SchemaShorthand {
  if (!value || typeof value !== "object" || isOpenApiObjectSchema(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "string",
  );
}

/** Suy schema shorthand + required từ class-validator metadata. */
export function inferValidatorShorthand(Validator: ValidatorCtor): {
  schema: SchemaShorthand;
  required: string[];
} {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    Validator,
    Validator.name,
    true,
    false,
  );

  const schema: SchemaShorthand = {};
  const required: string[] = [];

  for (const m of metadata) {
    const prop = m.propertyName;
    if (schema[prop]) continue;

    const designType = Reflect.getMetadata("design:type", Validator.prototype, prop);
    if (designType === Number) schema[prop] = "number";
    else if (designType === Boolean) schema[prop] = "boolean";
    else if (designType === Array) schema[prop] = "string[]";
    else schema[prop] = "string";

    const isOptional = metadata.some(
      (meta) => meta.propertyName === prop && meta.type === "isOptional",
    );
    if (!isOptional) required.push(prop);
  }

  return { schema, required };
}

function staticFromValidator(Validator: ValidatorCtor): {
  schema: SchemaShorthand;
  required?: string[];
} {
  const v = Validator as ValidatorCtor & {
    schema?: SchemaShorthand;
    required?: readonly string[];
  };
  if (v.schema && Object.keys(v.schema).length > 0) {
    return {
      schema: { ...v.schema },
      required: v.required ? [...v.required] : undefined,
    };
  }
  return { schema: {} };
}

/**
 * Chuẩn hóa params/body cho Swagger.
 * Ưu tiên config người dùng (static schema / shorthand), thiếu thì bổ sung từ class-validator.
 */
export function resolveFieldSchema(
  input: SchemaShorthand | ValidatorCtor | OpenApiObjectSchema | undefined,
  userRequired?: string[],
): {
  shorthand?: SchemaShorthand;
  openApi?: OpenApiObjectSchema;
  required?: string[];
} {
  if (!input) return {};

  if (isOpenApiObjectSchema(input)) {
    return { openApi: input };
  }

  if (isSchemaShorthand(input)) {
    return {
      shorthand: { ...input },
      required: userRequired?.length ? [...userRequired] : Object.keys(input),
    };
  }

  if (isValidatorClass(input)) {
    registerValidatorClass(input);
    const inferred = inferValidatorShorthand(input);
    const manual = staticFromValidator(input);
    const shorthand = { ...inferred.schema, ...manual.schema };
    const required =
      userRequired ??
      manual.required ??
      (inferred.required.length ? inferred.required : undefined);
    return {
      shorthand: Object.keys(shorthand).length ? shorthand : undefined,
      required: required?.length ? [...required] : undefined,
    };
  }

  return {};
}

export function inferValidatorOpenApiSchema(Validator: ValidatorCtor): OpenApiObjectSchema {
  const { shorthand, required } = resolveFieldSchema(Validator) as {
    shorthand: SchemaShorthand;
    required?: string[];
  };
  const toProp = (type: string) => {
    if (type === "number") return { type: "number" };
    if (type === "boolean") return { type: "boolean" };
    if (type === "string[]" || type === "array") {
      return { type: "array", items: { type: "string" } };
    }
    return { type: "string" };
  };
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(shorthand).map(([k, v]) => [k, toProp(v)]),
    ),
    required: required?.length ? required : undefined,
  };
}
