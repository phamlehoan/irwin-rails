export type SchemaShorthand = Record<string, string>;

export type ValidatorCtor = new () => object & {
  schema?: SchemaShorthand;
  required?: readonly string[];
};

export function isValidatorClass(value: unknown): value is ValidatorCtor {
  return typeof value === "function" && Boolean((value as ValidatorCtor).prototype);
}
