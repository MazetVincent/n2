import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Mêmes réglages que l'application, sans les copies du projet dans .claude/worktrees/
// (sinon les tests des autres branches en cours tournent aussi, et une vieille copie peut faire échouer main).
export default mergeConfig(viteConfig, defineConfig({ test: { exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"] } }));
