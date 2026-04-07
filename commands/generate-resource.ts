import fs from "fs";
import path from "path";
import pluralize from "pluralize";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: yarn g:resource ModelName field:type");
  process.exit(1);
}

const inputName = args[0];
const parts = inputName.split(/[:/]/);
const rawName = parts.pop()!;
const subDir = parts.join("/").toLowerCase();
const namePlural = pluralize(rawName.toLowerCase());

const root = process.cwd();
const controllerPath = path.join(
  root,
  "app/controllers",
  subDir,
  `${namePlural}.controller.ts`,
);
const routePath = path.join(
  root,
  "app/routes",
  subDir,
  `${namePlural}.route.ts`,
);

const className = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("") + 
                 rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase() + "Controller";

let parentClass = "ApplicationController";
let parentImport = ".";

if (parts.length > 0) {
  const lastNamespace = parts[parts.length - 1].toLowerCase();
  parentClass = lastNamespace.charAt(0).toUpperCase() + lastNamespace.slice(1) + "Controller";
  parentImport = `./${lastNamespace}.controller`;
}

const controllerTemplate = `import { ${parentClass} } from "${parentImport}";
import models from "@models";

export class ${className} extends ${parentClass} {
  async index() {
    const items = await models.${rawName.toLowerCase()}.findMany();
    this.renderJson(items);
  }

  async show() {
    const item = await models.${rawName.toLowerCase()}.findUnique({ where: { id: this.req.params.id } });
    this.renderJson(item);
  }

  async create() {
    const params = await this.params.permit(${args.slice(1).map(f => `'${f.split(':')[0]}'`).join(", ")});
    const item = await models.${rawName.toLowerCase()}.create({ data: params });
    this.renderJson(item, 201);
  }
}
`;

const routeTemplate = `import { RailsRoute } from "ts-rails";
import { ${className} } from "@controllers/${subDir ? subDir + "/" : ""}${namePlural}.controller";

export class ${rawName}Route extends RailsRoute {
  draw() {
    this.resource("${namePlural}", ${className}, { only: ["index", "show", "create"] });
  }
}
`;

const writeFile = (filePath: string, content: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`\x1b[32mCREATE\x1b[0m ${path.relative(root, filePath)}`);
};

writeFile(controllerPath, controllerTemplate);
writeFile(routePath, routeTemplate);

console.log(
  `\n\x1b[33mResource generated!\x1b[0m (Remember to add to schema.prisma and routes/index.ts)`,
);
