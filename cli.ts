#!/usr/bin/env node

import { spawn } from "child_process";
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { resolveRailsAppRoot } from "./commands/resolveRailsAppRoot";

const program = new Command();

program.name("rails").description("TS Rails CLI").version("1.0.0");

program
  .command("generate")
  .alias("g")
  .description("Generate code")
  .argument(
    "<type>",
    "Type of code to generate (scaffold, resource, controller, service, mailer, job, channel, test)",
  )
  .argument("<name>", "Name of the resource")
  .argument("[fields...]", "Fields for the resource")
  .option("--api", "Generate API-only resource")
  .action((type, name, fields, options) => {
    const appRoot = resolveRailsAppRoot();
    const commandFile = path.join(__dirname, "commands", `generate-${type}.js`);
    const spawnArgs = [name, ...fields];
    if (options.api) spawnArgs.push("--api");

    if (fs.existsSync(commandFile)) {
      // Run the compiled command
      const child = spawn("node", [commandFile, ...spawnArgs], {
        stdio: "inherit",
        cwd: appRoot,
        shell: false,
      });
      child.on("close", (code) => {
        process.exit(code);
      });
    } else {
      // For development, try ts-node
      const tsCommandFile = path.join(
        __dirname,
        "..",
        "commands",
        `generate-${type}.ts`,
      );
      if (fs.existsSync(tsCommandFile)) {
        const child = spawn("npx", ["ts-node", tsCommandFile, ...spawnArgs], {
            stdio: "inherit",
            cwd: appRoot,
            shell: false,
          },
        );
        child.on("close", (code) => {
          process.exit(code);
        });
      } else {
        console.error(`Unknown generate type: ${type}`);
        process.exit(1);
      }
    }
  });

program
  .command("console")
  .alias("c")
  .description("Start Rails console")
  .action(() => {
    const appRoot = resolveRailsAppRoot();
    const commandFile = path.join(__dirname, "commands", "console.js");
    if (fs.existsSync(commandFile)) {
      const child = spawn("node", ["--import", "tsx", commandFile], {
        stdio: "inherit",
        cwd: appRoot,
        shell: false,
      });
      child.on("close", (code) => {
        process.exit(code);
      });
    } else {
      const tsCommandFile = path.join(
        __dirname,
        "..",
        "commands",
        "console.ts",
      );
      if (fs.existsSync(tsCommandFile)) {
        const child = spawn("npx", ["ts-node", tsCommandFile], {
          stdio: "inherit",
          cwd: appRoot,
          shell: false,
        });
        child.on("close", (code) => {
          process.exit(code);
        });
      } else {
        console.error("Console command not found");
        process.exit(1);
      }
    }
  });

program
  .command("routes")
  .alias("r")
  .description("List all routes")
  .action(() => {
    const appRoot = resolveRailsAppRoot();
    const commandFile = path.join(__dirname, "commands", "routes.js");
    if (fs.existsSync(commandFile)) {
      const child = spawn("node", ["--import", "tsx", commandFile], {
        stdio: "inherit",
        cwd: appRoot,
        shell: false,
      });
      child.on("close", (code) => {
        process.exit(code);
      });
    } else {
      const tsCommandFile = path.join(__dirname, "..", "commands", "routes.ts");
      if (fs.existsSync(tsCommandFile)) {
        const child = spawn("npx", ["ts-node", tsCommandFile], {
          stdio: "inherit",
          cwd: appRoot,
          shell: false,
        });
        child.on("close", (code) => {
          process.exit(code);
        });
      } else {
        console.error("Routes command not found");
        process.exit(1);
      }
    }
  });

program
  .command("notes")
  .alias("n")
  .description("List TODO, FIXME, and OPTIMIZE annotations in the codebase")
  .action(() => {
    const appRoot = resolveRailsAppRoot();
    const commandFile = path.join(__dirname, "commands", "notes.js");
    if (fs.existsSync(commandFile)) {
      const child = spawn("node", [commandFile], {
        stdio: "inherit",
        cwd: appRoot,
        shell: false,
      });
      child.on("close", (code) => {
        process.exit(code ?? 0);
      });
    } else {
      const tsCommandFile = path.join(__dirname, "..", "commands", "notes.ts");
      if (fs.existsSync(tsCommandFile)) {
        const child = spawn("npx", ["ts-node", tsCommandFile], {
          stdio: "inherit",
          cwd: appRoot,
          shell: false,
        });
        child.on("close", (code) => {
          process.exit(code ?? 0);
        });
      } else {
        console.error("Notes command not found");
        process.exit(1);
      }
    }
  });

program.parse();
