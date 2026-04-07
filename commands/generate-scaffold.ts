import fs from "fs";
import path from "path";
import pluralize from "pluralize";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: yarn scaffold ModelName field:type field:type");
  process.exit(1);
}

const isApi = args.includes("--api");
const cleanArgs = args.filter(arg => arg !== "--api");

const inputName = cleanArgs[0]; // Ví dụ: Admin/User
const parts = inputName.split(/[:/]/);
const rawModelName = parts.pop()!; // User
const subDir = parts.join("/").toLowerCase(); // admin

const modelName = pluralize.singular(rawModelName);
const modelLower = modelName.toLowerCase();
const modelPlural = pluralize(modelLower);
const className = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("") + 
                 modelName.charAt(0).toUpperCase() + modelName.slice(1).toLowerCase() + "Controller";

const viewBase = [...parts, modelPlural].map(p => p.toLowerCase()).join(".");

const fields = cleanArgs.slice(1).map((f) => {
  const [name, type] = f.split(":");
  return { name, type: type || "string" };
});

const root = process.cwd();

// Định nghĩa đường dẫn lưu file
const controllerDir = path.join(root, "app/controllers", subDir);
const viewsDir = path.join(root, "app/views", `${viewBase}.view`);
const paths = {
  controller: path.join(controllerDir, `${modelPlural}.controller.ts`),
  test: path.join(controllerDir, "__tests__", `${modelPlural}.controller.spec.ts`),
  route: path.join(root, "app/routes", subDir, `${modelPlural}.route.ts`),
  viewsDir: viewsDir,
};

let parentClass = "ApplicationController";
let parentImport = ".";

if (parts.length > 0) {
  const lastNamespace = parts[parts.length - 1].toLowerCase();
  parentClass = lastNamespace.charAt(0).toUpperCase() + lastNamespace.slice(1) + "Controller";
  parentImport = `./${lastNamespace}.controller`;
}

// 1. Generate Controller
const controllerTemplate = isApi 
? `import { ${parentClass} } from "${parentImport}";
import models from "@models";

export class ${className} extends ${parentClass} {
  async index() {
    const ${modelPlural} = await models.${modelLower}.findMany();
    this.renderJson(${modelPlural});
  }

  async show() {
    const ${modelLower} = await models.${modelLower}.findUnique({ where: { id: this.req.params.id } });
    this.renderJson(${modelLower});
  }

  async create() {
    const params = await this.params.permit(${fields.map((f) => `'${f.name}'`).join(", ")});
    const ${modelLower} = await models.${modelLower}.create({ data: params });
    this.renderJson(${modelLower}, 201);
  }

  async update() {
    const params = await this.params.permit(${fields.map((f) => `'${f.name}'`).join(", ")});
    const ${modelLower} = await models.${modelLower}.update({
      where: { id: this.req.params.id },
      data: params,
    });
    this.renderJson(${modelLower});
  }

  async destroy() {
    await models.${modelLower}.delete({ where: { id: this.req.params.id } });
    this.renderJson({ success: true });
  }
}
`
: `import { FlashType } from "@configs/enum";
import { ${parentClass} } from "${parentImport}";
import models from "@models";

export class ${className} extends ${parentClass} {
  async index() {
    const ${modelPlural} = await models.${modelLower}.findMany();
    this.render("${viewBase}.view/index", { ${modelPlural} });
  }

  async show() {
    const ${modelLower} = await models.${modelLower}.findUnique({ where: { id: this.req.params.id } });
    this.render("${viewBase}.view/show", { ${modelLower} });
  }

  async new() {
    this.render("${viewBase}.view/new", { ${modelLower}: {} });
  }

  async edit() {
    const ${modelLower} = await models.${modelLower}.findUnique({ where: { id: this.req.params.id } });
    this.render("${viewBase}.view/edit", { ${modelLower} });
  }

  async create() {
    const params = await this.params.permit(${fields.map((f) => `'${f.name}'`).join(", ")});
    await models.${modelLower}.create({ data: params });
    this.flash(FlashType.Success, { msg: this.t("flash.created") });
    this.redirect(\`/${subDir ? subDir + "/" : ""}${modelPlural}\`);
  }

  async update() {
    const params = await this.params.permit(${fields.map((f) => `'${f.name}'`).join(", ")});
    await models.${modelLower}.update({
      where: { id: this.req.params.id },
      data: params,
    });
    this.flash(FlashType.Success, { msg: this.t("flash.updated") });
    this.redirect(\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${this.req.params.id}\`);
  }

  async destroy() {
    await models.${modelLower}.delete({ where: { id: this.req.params.id } });
    this.flash(FlashType.Success, { msg: this.t("flash.destroyed") });
    this.redirect(\`/${subDir ? subDir + "/" : ""}${modelPlural}\`);
  }
}
`;

// 2. Generate Route Template
const routeTemplate = `import { RailsRoute } from "ts-rails";
import { ${className} } from "@controllers/${subDir ? subDir + "/" : ""}${modelPlural}.controller";

export class ${modelName}Route extends RailsRoute {
  draw() {
    this.resource("${modelPlural}", ${className}${isApi ? ", { api: true }" : ""});
  }
}
`;

// 4. Generate Test Template
const testTemplate = `import { ${className} } from "../${modelPlural}.controller";

describe("${className}", () => {
  it("should have REST actions defined", () => {
    const controller = new ${className}();
    expect(controller.index).toBeDefined();
    expect(controller.show).toBeDefined();
    expect(controller.create).toBeDefined();
    expect(controller.update).toBeDefined();
    expect(controller.destroy).toBeDefined();
  });
});
`;

// 3. Generate Views (Index & Form)
const indexView = `extends ../layouts/application

block content
  .d-flex.justify-content-between.align-items-center.mb-4
    h1 List of ${modelName}s
    a.btn.btn-primary(href="/${subDir ? subDir + "/" : ""}${modelPlural}/new") New ${modelName}

  table.table.table-striped
    thead
      tr
${fields.map((f) => `        th ${f.name.charAt(0).toUpperCase() + f.name.slice(1)}`).join("\n")}
        th Actions
    tbody
      each item in ${modelPlural}
        tr
${fields.map((f) => `          td= item.${f.name}`).join("\n")}
          td
            a.btn.btn-sm.btn-info.me-2(href=\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${item.id}\`) Show
            a.btn.btn-sm.btn-warning.me-2(href=\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${item.id}/edit\`) Edit
            form.d-inline(method="POST" action=\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${item.id}?_method=DELETE\`)
              button.btn.btn-sm.btn-danger(onclick="return confirm('Are you sure?')") Delete
`;

const showView = `extends ../layouts/application

block content
  .d-flex.justify-content-between.align-items-center.mb-4
    h1 ${modelName} Details
    div
      a.btn.btn-warning.me-2(href=\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${${modelLower}.id}/edit\`) Edit
      a.btn.btn-secondary(href="/${subDir ? subDir + "/" : ""}${modelPlural}") Back

  .card
    .card-body
${fields.map((f) => `      p
        strong ${f.name.charAt(0).toUpperCase() + f.name.slice(1)}:
        span= ${modelLower}.${f.name}`).join("\n")}
`;

const formView = `
${fields
  .map(
    (f) => `
.mb-3
  label.form-label ${f.name.charAt(0).toUpperCase() + f.name.slice(1)}
  input.form-control(name="${f.name}" value=item.${f.name} || '')`,
  )
  .join("")}
button.btn.btn-success(type="submit") Save
`;

const newView = `extends ../layouts/application

block content
  h1 New ${modelName}
  form(method="POST" action="/${subDir ? subDir + "/" : ""}${modelPlural}")
    - var item = ${modelLower}
    include _form
`;

const editView = `extends ../layouts/application

block content
  h1 Edit ${modelName}
  form(method="POST" action=\`/${subDir ? subDir + "/" : ""}${modelPlural}/\${${modelLower}.id}?_method=PUT\`)
    - var item = ${modelLower}
    include _form
`;

// Write files
const writeFile = (filePath: string, content: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`\x1b[32mCREATE\x1b[0m ${path.relative(root, filePath)}`);
};

writeFile(paths.controller, controllerTemplate);
writeFile(paths.test, testTemplate);
writeFile(paths.route, routeTemplate);

if (!isApi) {
  writeFile(path.join(paths.viewsDir, "show.pug"), showView);
  writeFile(path.join(paths.viewsDir, "index.pug"), indexView);
  writeFile(path.join(paths.viewsDir, "_form.pug"), formView);
  writeFile(path.join(paths.viewsDir, "new.pug"), newView);
  writeFile(path.join(paths.viewsDir, "edit.pug"), editView);
}

const typeMap: Record<string, string> = {
  string: "String",
  int: "Int",
  boolean: "Boolean",
  datetime: "DateTime",
  float: "Float",
  json: "Json",
};

console.log(`
\x1b[33mNext Steps:\x1b[0m
1. Add the following to your prisma.schema:
   model ${modelName} {
     id        String   @id @default(uuid())
     ${fields.map((f) => `${f.name.padEnd(10)} ${typeMap[f.type.toLowerCase()] || "String"}`).join("\n     ")}
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
   }
2. Run: \x1b[36myarn db:migrate\x1b[0m
3. Register the route in \x1b[35mapp/routes/index.ts\x1b[0m:
   import { ${modelName}Route } from "./${subDir ? subDir + "/" : ""}${modelPlural}.route";
   // ... inside draw():
   this.path("/${subDir ? subDir + "/" : ""}${modelPlural}", ${modelName}Route.draw());
`);
