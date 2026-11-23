// Carte du code : motifs des fichiers (code, tests, générés), lecture des imports, couche d'un fichier, résumé d'un README.

import { builtinModules } from "node:module";
import type { Category } from "../types.ts";

export const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const TEST = /(\.(test|spec|stories|e2e)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|__mocks__|tests?|e2e|fixtures|stories|\.storybook)\//;
export const GENERATED = /(^|\/)generated\/|\.gen\.[jt]s$/;
export const IGNORED = /(^|\/)(node_modules|dist|build|\.output|cdk\.out|coverage)\//;

// import x from "a" · import { x } from "a" · import "a" · export * from "a" · import("a") · require("a")
export const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*$\s{},]+?\s+from\s+)?["']([^"'\n]+)["']|import\(\s*["']([^"'\n]+)["']\s*\)|require\(\s*["']([^"'\n]+)["']\s*\)/g;

export const BUILTINS = new Set(builtinModules);

// ---------- Détection front / api / back / … ----------
const SIGNALS: Record<Exclude<Category, "shared">, RegExp> = {
  infra: /^(aws-cdk-lib|constructs|@aws-cdk\/|cdk-|@pulumi\/|cdktf)/,
  tooling: /^(commander|yargs|@clack\/|inquirer|@inquirer\/|ora|chalk|picocolors|execa|zx|listr2|prompts|cac|meow|tsx|@effect\/cli|@effect\/platform-node|ts-morph)$/,
  api: /^(@trpc\/server|openapi-fetch|openapi-typescript|@hey-api\/|@orpc\/server|hono|express|fastify|graphql|@apollo\/server)/,
  back: /^(node:|@sentry\/node|iron-session|ioredis|redis|pg|mysql2|@prisma\/|drizzle-orm|@aws-sdk\/|@opentelemetry\/|pino|winston|undici|dotenv)/,
  front: /^(react|react-dom|@mui\/|@emotion\/|@tanstack\/react-|@trpc\/client|@trpc\/tanstack-react-query|next|vue|svelte|solid-js|use-intl|react-hook-form|framer-motion)/,
};
export const ORDER: Category[] = ["infra", "tooling", "api", "back", "front", "shared"];

export function fileCategory(path: string, libs: string[], content: string): Category {
  const has = (c: Exclude<Category, "shared">) => libs.some((l) => SIGNALS[c].test(l));
  const react = has("front") || path.endsWith(".tsx") || path.endsWith(".jsx");
  if (has("infra") || /^infrastructure\//.test(path)) return "infra";
  if ((has("tooling") || /(^|\/)(scripts?|tools?|bin|[\w-]+-cli)\//.test(path)) && !react) return "tooling";
  if (has("api") || /(^|\/)(trpc|routers?|openapi|api|endpoints?)(\/|\.)/i.test(path)) return "api";
  if (has("back") || /(^|\/)(server|backend|workers?|jobs?)(\/|\.)/i.test(path) || /\bcreateServerFn\b/.test(content)) return "back";
  if (react) return "front";
  return "shared";
}

// Titre (# …) et premier vrai paragraphe d'un README, sans la syntaxe Markdown.
export function parseReadme(md: string): { title?: string; paragraph?: string } {
  const lines = md.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, "").split("\n");
  const title = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim();
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const l of lines) {
    if (/^\s*$/.test(l)) {
      if (current.length) paragraphs.push(current.join(" "));
      current = [];
    } else if (!/^\s*(#|>|\||[-*+]\s|\d+\.\s|!\[|<|\[!\[)/.test(l)) current.push(l.trim());
    else if (current.length) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(" "));
  const clean = (p: string) =>
    p
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/\s+/g, " ")
      .trim();
  const paragraph = paragraphs.map(clean).find((p) => p.length > 30);
  return { title, paragraph: paragraph && paragraph.length > 420 ? `${paragraph.slice(0, 417).replace(/\s+\S*$/, "")}…` : paragraph };
}
