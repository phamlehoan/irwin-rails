/**
 * @ApiDoc - decorator / route `document` cho Swagger.
 * params/body: Validator class (static schema hoặc class-validator) hoặc shorthand.
 */
import {
  type OpenApiObjectSchema,
  type SchemaShorthand,
  type ValidatorCtor,
  resolveFieldSchema,
} from "./validatorSchema";

type ResponseShorthand = Record<number | string, string>;

export interface ApiDocOptions {
  summary?: string;
  tags?: string[];
  /** Gắn Bearer JWT (`bearerAuth`). */
  auth?: boolean;
  /** Endpoint công khai — ghi đè `security: []` khi spec có security global. */
  public?: boolean;
  params?: SchemaShorthand | ValidatorCtor | OpenApiObjectSchema;
  requiredParams?: string[];
  body?: SchemaShorthand | ValidatorCtor | OpenApiObjectSchema;
  requiredBody?: string[];
  /** OpenAPI requestBody đầy đủ — ưu tiên cao nhất khi set. */
  requestBody?: Record<string, unknown>;
  file?: boolean;
  responses?: ResponseShorthand;
}

export type ResolvedApiDocSchema = {
  params?: SchemaShorthand;
  paramsOpenApi?: OpenApiObjectSchema;
  requiredParams?: string[];
  body?: SchemaShorthand;
  bodyOpenApi?: OpenApiObjectSchema;
  requiredBody?: string[];
};

export function resolveApiDocSchema(opts: ApiDocOptions): ResolvedApiDocSchema {
  const params = resolveFieldSchema(opts.params, opts.requiredParams);
  const body = resolveFieldSchema(opts.body, opts.requiredBody);

  return {
    params: params.shorthand,
    paramsOpenApi: params.openApi,
    requiredParams: params.required,
    body: body.shorthand,
    bodyOpenApi: body.openApi,
    requiredBody: body.required,
  };
}
