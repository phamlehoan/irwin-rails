import type { OpenApiObjectSchema, SchemaShorthand } from "./validatorSchema";
import type { ValidatorCtor } from "./validatorSchema";

/** Response shorthand: { 200: "OK" } → OpenAPI responses */
type ResponseShorthand = Record<number | string, string>;

export interface DocOptions {
  path: string;
  summary?: string;
  tags?: string[];
  params?: SchemaShorthand;
  body?: SchemaShorthand;
  paramsOpenApi?: OpenApiObjectSchema;
  bodyOpenApi?: OpenApiObjectSchema;
  requiredBody?: string[];
  requiredParams?: string[];
  requestBody?: Record<string, unknown>;
  file?: boolean;
  responses?: ResponseShorthand;
  auth?: boolean;
  public?: boolean;
}

function toJsonSchemaProperty(type: string): Record<string, unknown> {
  if (type === "number") return { type: "number" };
  if (type === "boolean") return { type: "boolean" };
  if (type === "string[]" || type === "array") {
    return { type: "array", items: { type: "string" } };
  }
  return { type: "string" };
}

function pathParametersFromTemplate(swaggerPath: string) {
  return [...swaggerPath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function queryParametersFromShorthand(
  params: SchemaShorthand,
  requiredFields?: string[],
) {
  return Object.entries(params).map(([name, type]) => ({
    name,
    in: "query",
    required: requiredFields?.includes(name) ?? false,
    schema: toJsonSchemaProperty(type),
  }));
}

function requestBodyFromShorthand(body: SchemaShorthand, requiredBody?: string[]) {
  const required = requiredBody ?? Object.keys(body);
  return {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: required.length ? required : undefined,
          properties: Object.fromEntries(
            Object.entries(body).map(([k, v]) => [k, toJsonSchemaProperty(v)]),
          ),
        },
      },
    },
  };
}

function requestBodyFromOpenApi(schema: OpenApiObjectSchema) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function mergeParameters(
  existing: Array<Record<string, unknown>> | undefined,
  extra: Array<Record<string, unknown>>,
) {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const p of existing ?? []) {
    byKey.set(`${p.in}::${p.name}`, p);
  }
  for (const p of extra) {
    byKey.set(`${p.in}::${p.name}`, p);
  }
  return [...byKey.values()];
}

/**
 * Tạo swagger operation từ route `document` (đã qua resolveApiDocSchema).
 */
export function buildSwaggerOp(opts: DocOptions): Record<string, unknown> {
  const { path: swaggerPath, auth, ...rest } = opts;
  const op: Record<string, unknown> = {};

  if (rest.summary) op.summary = rest.summary;
  if (rest.tags) op.tags = rest.tags;

  const parameters: Array<Record<string, unknown>> = [
    ...pathParametersFromTemplate(swaggerPath),
  ];

  if (rest.params && Object.keys(rest.params).length) {
    parameters.push(
      ...queryParametersFromShorthand(rest.params, rest.requiredParams),
    );
  }

  if (parameters.length) {
    op.parameters = mergeParameters(
      op.parameters as Array<Record<string, unknown>> | undefined,
      parameters,
    );
  }

  if (rest.file) {
    op.requestBody = {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    };
  } else if (rest.requestBody) {
    op.requestBody = rest.requestBody;
  } else if (rest.bodyOpenApi) {
    op.requestBody = requestBodyFromOpenApi(rest.bodyOpenApi);
  } else if (rest.body && Object.keys(rest.body).length) {
    op.requestBody = requestBodyFromShorthand(rest.body, rest.requiredBody);
  }

  if (rest.responses) {
    op.responses = Object.fromEntries(
      Object.entries(rest.responses).map(([code, desc]) => [
        code,
        { description: desc },
      ]),
    );
  }

  if (rest.public === true || auth === false) {
    op.security = [];
  } else if (auth) {
    op.security = [{ bearerAuth: [] }];
  }

  return op;
}
