// Outils de test : un faux monorepo créé dans un dossier temporaire (jamais de code réel du projet pro).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Config } from "../src/server/config.ts";

export function tempDir(prefix = "n2-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

export function gitInit(root: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

export const remove = (dir: string) => rmSync(dir, { recursive: true, force: true });

export function makeConfig(projectPath: string, overrides: Partial<Config["codemap"]> = {}): Config {
  return {
    port: 0,
    github: { repos: ["demo/demo"], recentDays: 14 },
    jira: { site: "demo.atlassian.net", projectKey: "DEMO", boardId: 1, onlyMine: true },
    libs: { projectPath, packages: ["react"] },
    sentry: { org: "demo", project: "demo" },
    aws: { profile: "demo", region: "eu-west-1", alarmPrefix: "", reconnectHint: "" },
    codemap: { projectPath, splitThreshold: 400, ...overrides },
  };
}

/** Petit monorepo : une app web (front + serveur tRPC), un package partagé avec "exports", de l'infra CDK. */
export function demoMonorepo(): string {
  const root = tempDir("n2-monorepo-");
  const feature = (i: number) => `export const f${i} = () => ${i};\n`;
  writeFiles(root, {
    "package.json": JSON.stringify({ name: "demo", workspaces: ["apps/*", "packages/*"] }),
    ".npmrc": "@secret:registry=https://npm.example.com/\n",
    "tsconfig.json": `{\n  // alias de l'app\n  "compilerOptions": { "paths": { "~/*": ["./apps/web/src/*"] } }\n}\n`,
    "package-lock.json": JSON.stringify({ packages: { "node_modules/react": { version: "19.0.0" } } }),
    "apps/web/package.json": JSON.stringify({ name: "@demo/web" }),
    "apps/web/README.md": "# @demo/web — site\n\n![badge](x.svg)\n\nLe site web de démo, construit avec **React** et une [API tRPC](https://trpc.io) partagée.\n",
    "apps/web/src/features/cart/Cart.tsx": [
      'import { useState } from "react";',
      'import { formatMoney } from "@demo/shared/money";',
      'import { helper } from "~/features/cart/helper";',
      "",
      "export function Cart() {",
      "  const [n] = useState(0);",
      "  return formatMoney(n) + helper();",
      "}",
      "",
    ].join("\n"),
    "apps/web/src/features/cart/helper.tsx": 'import { formatMoney } from "@demo/shared/money";\nexport const helper = () => formatMoney(1);\n',
    "apps/web/src/features/cart/f1.ts": feature(1),
    "apps/web/src/features/cart/f2.ts": feature(2),
    "apps/web/src/features/cart/f3.ts": feature(3),
    "apps/web/src/features/cart/f4.ts": feature(4),
    "apps/web/src/features/cart/Cart.test.tsx": 'import { describe } from "vitest";\nimport "./Cart";\ndescribe("cart", () => {});\n',
    "apps/web/src/server/router.ts": 'import { initTRPC } from "@trpc/server";\nimport { formatMoney } from "@demo/shared/money";\nexport const t = initTRPC.create();\nexport const m = formatMoney;\n',
    "packages/shared/package.json": JSON.stringify({ name: "@demo/shared", description: "Contrats partagés : monnaie et formats.", exports: { "./*": "./src/*.ts" } }),
    "packages/shared/src/money.ts": "export const formatMoney = (n: number) => `${n} €`;\n",
    "infrastructure/package.json": JSON.stringify({ name: "cdk" }),
    "infrastructure/app.ts": 'import * as cdk from "aws-cdk-lib";\nexport const app = new cdk.App();\n',
  });
  gitInit(root);
  return root;
}
