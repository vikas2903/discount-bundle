import path from "path";
import fs from "fs";
import { spawn } from "node:child_process";
import { describe, beforeAll, test, expect } from "vitest";
import {
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
} from "@shopify/shopify-function-test-helpers";

describe("Default Integration Test", () => {
  let schema;
  let functionDir;
  let functionInfo;
  let schemaPath;
  let targeting;
  let functionRunnerPath;
  let wasmPath;

  beforeAll(async () => {
    functionDir = path.dirname(__dirname);
    const appRootDir = path.dirname(functionDir);
    const functionName = path.basename(functionDir);
    await runShopifyCli(
      ["app", "function", "build", "--path", functionName],
      appRootDir,
    );
    functionInfo = JSON.parse(
      await runShopifyCli(
        ["app", "function", "info", "--json", "--path", functionName],
        appRootDir,
      ),
    );
    ({ schemaPath, functionRunnerPath, wasmPath, targeting } = functionInfo);
    schema = await loadSchema(schemaPath);
  }, 45000);

  const fixturesDir = path.join(__dirname, "fixtures");
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(fixturesDir, file));

  fixtureFiles.forEach((fixtureFile) => {
    test(`runs ${path.relative(fixturesDir, fixtureFile)}`, async () => {
      const fixture = await loadFixture(fixtureFile);
      const targetInputQueryPath = targeting[fixture.target].inputQueryPath;
      const inputQueryAST = await loadInputQuery(targetInputQueryPath);

      const validationResult = await validateTestAssets({ schema, fixture, inputQueryAST });
      expect(validationResult.inputQuery.errors).toEqual([]);
      expect(validationResult.inputFixture.errors).toEqual([]);
      expect(validationResult.outputFixture.errors).toEqual([]);

      const runResult = await runFunction(
        fixture,
        functionRunnerPath,
        wasmPath,
        targetInputQueryPath,
        schemaPath,
      );
      expect(runResult.error).toBeNull();
      expect(runResult.result.output).toEqual(fixture.expectedOutput);
    }, 10000);
  });
});

function runShopifyCli(args, cwd) {
  const repositoryRoot = path.resolve(cwd, "..");
  const cliPaths = [
    path.join(repositoryRoot, "node_modules", ".bin"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "",
  ].filter(Boolean);
  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ||
    "PATH";
  const env = {
    ...process.env,
    [pathKey]: [...cliPaths, process.env[pathKey] || ""].join(path.delimiter),
    SHOPIFY_INVOKED_BY: "shopify-function-test-helpers",
  };

  return new Promise((resolve, reject) => {
    const cli = spawn("shopify", args, {
      cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    cli.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    cli.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    cli.on("error", reject);
    cli.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Shopify CLI exited with code ${code}: ${stderr.trim()}`),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runFunction(fixture, runnerPath, wasmPath, queryPath, schemaPath) {
  return new Promise((resolve) => {
    const runner = spawn(
      runnerPath,
      [
        "-f",
        wasmPath,
        "--export",
        fixture.export,
        "--query-path",
        queryPath,
        "--schema-path",
        schemaPath,
        "--json",
      ],
      {
        shell:
          process.platform === "win32" && /\.(cmd|bat)$/i.test(runnerPath),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;

    runner.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    runner.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    runner.on("error", (error) => {
      settled = true;
      resolve({ result: null, error: `Failed to start function-runner: ${error.message}` });
    });
    runner.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        resolve({
          result: null,
          error: `function-runner failed with exit code ${code}: ${stderr}`,
        });
        return;
      }
      try {
        const output = JSON.parse(stdout);
        resolve(
          output.output
            ? { result: { output: output.output }, error: null }
            : {
                result: null,
                error: `function-runner returned unexpected output: ${stdout}`,
              },
        );
      } catch (error) {
        resolve({
          result: null,
          error: `Failed to parse function-runner output: ${error.message}`,
        });
      }
    });
    runner.stdin.end(JSON.stringify(fixture.input));
  });
}
