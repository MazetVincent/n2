// Compile messages/*.json en fonctions typées (src/paraglide/), avec les mêmes réglages que le plugin Vite.
//   bun run i18n
import { compile } from "@inlang/paraglide-js";
import { paraglideOptions } from "../paraglide.config.ts";

await compile({ ...paraglideOptions, strategy: [...paraglideOptions.strategy] });
