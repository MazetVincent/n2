// Documentation du projet suivi pour la recherche de la carte : tous les README du dépôt (fichiers suivis par git),
// découpés par titre, et le texte des sections du guide de l'équipe (s'il est configuré).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { run } from "../run.ts";
import { prepareDocs, readmePassages, type PreparedDocs } from "../../features/docs/logic.ts";
import { projectRoot } from "./codemap.ts";
import { guidePassages } from "./guide.ts";

const README = /(^|\/)readme(\.[\w-]+)?\.md$/i;
const IGNORED = /(^|\/)(node_modules|dist|build|\.output|cdk\.out|coverage)\//;
/** Un README plus gros est sans doute généré (changelog, référence d'API) : on le saute */
const MAX_README = 300_000;

export async function docIndex(cfg: Config): Promise<PreparedDocs> {
  const root = projectRoot(cfg);
  const files = await run("git", ["-C", root, "ls-files", "-z"], 30_000)
    .then((out) => out.split("\0").filter((f) => README.test(f) && !IGNORED.test(f)))
    .catch(() => [] as string[]);
  const readmes = await Promise.all(
    files.map((f) =>
      readFile(join(root, f), "utf8")
        .then((md) => (md.length > MAX_README ? [] : readmePassages(f, md)))
        .catch(() => []),
    ),
  );
  // sans guide (non configuré, fichier absent), la recherche se contente des README
  const guide = cfg.guide?.path && cfg.guide.enabled !== false && cfg.ui?.secret?.unlocked ? await guidePassages(cfg).catch(() => []) : [];
  return prepareDocs([...readmes.flat(), ...guide]);
}
