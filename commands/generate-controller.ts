import fs from "fs";
import path from "path";
import pluralize from "pluralize";
import { resolveRailsAppRoot } from "./resolveRailsAppRoot";
import {
  ensureFlashTypeEnum,
  namespacePrefix,
  parseNamespace,
  pascalCase,
  urlPathPrefix,
} from "./generatorHelpers";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: yarn g:controller Name [action action...]");
  process.exit(1);
}

const isApi = args.includes("--api");
const cleanArgs = args.filter(arg => arg !== "--api");

const inputName = cleanArgs[0]; // Ví dụ: Admin:User hoặc User
const actions = cleanArgs.slice(1);

const { parts, subDir, rawName } = parseNamespace(inputName);

const namePlural = pluralize(rawName.toLowerCase());
const className = namespacePrefix(parts) + pascalCase(rawName) + "Controller";
const listPath = urlPathPrefix(subDir, namePlural);
const memberPath = `${listPath}/\${this.req.params.id}`;

const root = resolveRailsAppRoot();
const controllerDir = path.join(root, "app/controllers", subDir);
const viewBase = [...parts, rawName].map(p => p.toLowerCase()).join(".");
const controllerPath = path.join(controllerDir, `${namePlural}.controller.ts`);
const viewsDir = path.join(root, "app/views", `${viewBase}.view`);

let parentClass = "ApplicationController";
let parentImport = ".";

if (parts.length > 0) {
  const lastNamespace = parts[parts.length - 1].toLowerCase();
  parentClass = lastNamespace.charAt(0).toUpperCase() + lastNamespace.slice(1) + "Controller";
  parentImport = `./${lastNamespace}.controller`;
}

// Nếu không truyền action, mặc định tạo 7 REST actions
const targetActions = actions.length > 0 ? actions : ["index", "show", "new", "edit", "create", "update", "destroy"];

// 1. Template Controller
const template = isApi
? `import { ${parentClass} } from "${parentImport}";

export class ${className} extends ${parentClass} {
${targetActions.filter(a => !['new', 'edit'].includes(a)).map(action => `
  async ${action}() {
    // TODO: logic for ${action}
    this.renderJson({ action: "${action}" });
  }`).join('\n')}
}
`
: `import { FlashType } from "@configs/enum";
import { ${parentClass} } from "${parentImport}";

export class ${className} extends ${parentClass} {
  async index() {
    this.render("${viewBase}.view/index");
  }

  async show() {
    this.render("${viewBase}.view/show");
  }

  async new() {
    this.render("${viewBase}.view/new");
  }

  async edit() {
    this.render("${viewBase}.view/edit");
  }

  async create() {
    this.flash(FlashType.Success, { msg: this.t("flash.created") });
    this.redirect(\`${listPath}\`);
  }

  async update() {
    this.flash(FlashType.Success, { msg: this.t("flash.updated") });
    this.redirect(\`${memberPath}\`);
  }

  async destroy() {
    this.flash(FlashType.Success, { msg: this.t("flash.destroyed") });
    this.redirect(\`${listPath}\`);
  }
}
`;

const writeFile = (filePath: string, content: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`\x1b[32mCREATE\x1b[0m ${path.relative(root, filePath)}`);
};

if (!isApi) {
  ensureFlashTypeEnum(root, writeFile);
}

writeFile(controllerPath, template);

// 2. Create Views for each action
if (!isApi) {
  targetActions.forEach((action) => {
    const viewPath = path.join(viewsDir, `${action}.pug`);
    const viewTemplate = `extends ../layouts/application

block content
  h1 ${className}#${action}
  p Find me in app/views/${viewBase}.view/${action}.pug
`;
    writeFile(viewPath, viewTemplate);
  });
}

console.log(`
\x1b[33mNext Steps:\x1b[0m
Register routes in \x1b[35mconfigs/routes/index.ts\x1b[0m:
  this.resource(${className}${isApi ? ", { api: true }" : ""});
`);
