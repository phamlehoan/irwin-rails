import { plainToInstance } from "class-transformer";
import {
  getMetadataStorage,
  validate,
  ValidationError,
} from "class-validator";
import { UnprocessableEntityError } from "../../lib";

/**
 * Strong Parameters - Rails style: params.require(:model).permit(:field1, :field2)
 * params(Model).permit('id', 'name') - Model: class-validator class.
 * - Prisma: thêm prisma-class-validator-generator nếu cần params(User).permit(...) với User từ schema.
 * - Custom: tạo Validator class riêng (CreateUserValidator, etc.) cho trường hợp đặc biệt.
 */

/** Constructor type để InstanceType<M> suy ra đúng kiểu instance, không bị rút gọn thành object */
export type ValidatorClass = new (...args: any[]) => any;
type PermitArg = string | string[];

/** Helper format lỗi từ class-validator (chuyển vào rails để tránh phụ thuộc ngược) */
function formatValidationErrors(
  errors: ValidationError[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const error of errors) {
    const constraints = error.constraints;
    if (constraints) {
      result[error.property] = Object.values(constraints);
    }
    if (error.children && error.children.length > 0) {
      const childrenErrors = formatValidationErrors(error.children);
      Object.assign(result, childrenErrors);
    }
  }
  return result;
}

function normalizePermitFields(fields: PermitArg[]): string[] {
  const out: string[] = [];
  for (const field of fields) {
    if (Array.isArray(field)) {
      for (const item of field) {
        if (typeof item === "string" && item && !out.includes(item)) out.push(item);
      }
      continue;
    }
    if (typeof field === "string" && field && !out.includes(field)) out.push(field);
  }
  return out;
}

function getValidatorFieldNames<T extends object>(
  ValidatorCls: new () => T,
): string[] {
  const metadata = getMetadataStorage();
  const targetMetadata = metadata.getTargetValidationMetadatas(
    ValidatorCls,
    ValidatorCls.name,
    true,
    false,
  );
  const fromDecorators = Array.from(
    new Set(
      targetMetadata
        .map((m) => m.propertyName)
        .filter((name): name is string => Boolean(name)),
    ),
  );
  if (fromDecorators.length > 0) return fromDecorators;

  const instance = new ValidatorCls();
  return Object.keys(instance as object);
}

/**
 * Whitelist: chỉ giữ các field được permit, bỏ phần còn lại.
 * Validate qua class-validator nếu Model có decorators.
 */
export async function strongParams<T extends object>(
  input: unknown,
  ValidatorCls: new () => T,
  fields: string[],
): Promise<T> {
  const data = (input ?? {}) as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in data) picked[f] = data[f];
  }
  const instance = plainToInstance(ValidatorCls, picked, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    const formatted = formatValidationErrors(errors);
    throw new UnprocessableEntityError("Validation failed", formatted);
  }
  return instance as T;
}

async function validateDefinedParams<T extends object>(
  input: unknown,
  ValidatorCls: new () => T,
): Promise<T> {
  return strongParams(input, ValidatorCls, getValidatorFieldNames(ValidatorCls));
}

export class ParamsProxy<M extends ValidatorClass | undefined = undefined> {
  private resolved?: Promise<any>;

  constructor(
    public readonly data: Record<string, unknown>,
    private readonly Model?: M,
  ) {}

  /**
   * require(key) - Rails: params.require(:user), trả về nested.
   */
  require(key: string): ParamsProxy<M> {
    const value = this.data[key];
    if (value === undefined || value === null) {
      throw new UnprocessableEntityError(
        `param is missing or the value is empty: ${key}`,
      );
    }
    const obj =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    return new ParamsProxy<M>(obj, this.Model);
  }

  /**
   * permit(...fields) - Rails: chỉ giữ các field được phép.
   * Hỗ trợ cả permit("a", "b") lẫn permit(["a", "b"]).
   * Model (từ params(Model)) dùng để validate qua class-validator.
   */
  async permit(...fields: PermitArg[]): Promise<any> {
    const normalized = normalizePermitFields(fields);
    const picked: Record<string, unknown> = {};
    for (const f of normalized) {
      if (f in this.data) picked[f] = this.data[f];
    }

    if (!this.Model) {
      return picked;
    }
    return strongParams(this.data, this.Model, normalized);
  }

  async resolve(): Promise<any> {
    if (!this.resolved) {
      this.resolved = this.Model
        ? validateDefinedParams(this.data, this.Model)
        : Promise.resolve({ ...this.data });
    }
    return this.resolved;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: any) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null,
  ): Promise<any | TResult> {
    return this.resolve().catch(onrejected ?? undefined);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return this.resolve().finally(onfinally ?? undefined);
  }

  get(key: string): unknown {
    return this.data[key];
  }
}

type ParamsProxyWithData = Record<string, any> & {
  permit: (...fields: PermitArg[]) => Promise<any>;
  require: (key: string) => ParamsProxyWithData;
  get: (key: string) => unknown;
  then: ParamsProxy["then"];
  catch: ParamsProxy["catch"];
  finally: ParamsProxy["finally"];
};

function wrapProxy<TResolved>(
  proxy: ParamsProxy<any>,
): ParamsProxyWithData & PromiseLike<TResolved> {
  return new Proxy(proxy, {
    get(target, prop, receiver) {
      if (prop === "require") return target.require.bind(target);
      if (prop === "permit") return target.permit.bind(target);
      if (prop === "get") return target.get.bind(target);
      if (prop === "resolve") return target.resolve.bind(target);
      if (prop === "then") return target.then.bind(target);
      if (prop === "catch") return target.catch.bind(target);
      if (prop === "finally") return target.finally.bind(target);
      if (typeof prop === "string" && prop in target.data) {
        return target.data[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target.data);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && prop in target.data) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: target.data[prop],
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    has(target, prop) {
      return (typeof prop === "string" && prop in target.data) || Reflect.has(target, prop);
    },
  }) as ParamsProxyWithData & PromiseLike<TResolved>;
}

/**
 * params(Model) - Rails: Model là type/schema (Prisma-generated hoặc custom Validator).
 * await params(Model) - validate toàn bộ dữ liệu merged theo field được định nghĩa trong Model.
 * permit('field1', 'field2') - whitelist + validate.
 *
 * @example
 * // Flat
 * await params(CreateUserValidator).permit('firstName', 'lastName', 'email', 'roleIds');
 * await params(CreateUserValidator);
 *
 * // Nested: body = { user: { firstName, lastName } }
 * await params(CreateUserValidator).require('user').permit('firstName', 'lastName', 'email');
 */
export type ParamsWithoutModel = ParamsProxyWithData &
  PromiseLike<Record<string, unknown>>;

export type ParamsWithModel<M extends ValidatorClass> = ParamsProxyWithData &
  PromiseLike<InstanceType<M>> & {
    permit: (...fields: PermitArg[]) => Promise<InstanceType<M>>;
    require: (key: string) => ParamsWithModel<M>;
  };

export type ParamsCallable = {
  (): ParamsWithoutModel;
  <M extends ValidatorClass>(Model: M): ParamsWithModel<M>;
} & ParamsWithoutModel;

export function createParamsProxy(data: Record<string, unknown>): ParamsCallable {
  const root = wrapProxy<Record<string, unknown>>(new ParamsProxy(data));

  const callable = ((Model?: ValidatorClass) => {
    if (!Model) return root;
    return wrapProxy(new ParamsProxy(data, Model));
  }) as ParamsCallable;

  return new Proxy(callable, {
    apply(target, thisArg, argArray) {
      const [Model] = argArray as [ValidatorClass?];
      return Model ? callable(Model) : callable();
    },
    get(target, prop, receiver) {
      if (prop === "length" || prop === "name" || prop === "prototype") {
        return Reflect.get(target, prop, receiver);
      }
      return Reflect.get(root, prop, receiver);
    },
    ownKeys() {
      return Reflect.ownKeys(root);
    },
    getOwnPropertyDescriptor(target, prop) {
      return (
        Reflect.getOwnPropertyDescriptor(root, prop) ??
        Reflect.getOwnPropertyDescriptor(target, prop)
      );
    },
    has(target, prop) {
      return Reflect.has(root, prop) || Reflect.has(target, prop);
    },
  }) as ParamsCallable;
}
