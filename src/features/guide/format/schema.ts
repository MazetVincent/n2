// Format « n2-guide/1 » : le contenu d'un guide en JSON, lu par N2 à la place de son HTML compilé.
// Code générique : il n'importe rien de N2 (seulement zod), pour pouvoir un jour en faire un paquet à part.
// Un test le vérifie (tests/guide.test.ts).
//
// Le guide fournit, pour chaque page, son texte tel qu'il l'affiche : un arbre par langue, de même forme.
// Les sections sont les objets de cet arbre qui portent un `id` listé dans `sections` (titre : `title` ou `heading`).
// Les textes gardent la syntaxe en ligne du guide (nommée par `inline`), celle que N2 lit déjà dans le HTML :
//   [[terme|Texte]]  terme du glossaire     [texte](#/page/section)  lien interne
//   `chemin:10-20`   fichier cité (lignes)   `commit:sha`             commit
import { z } from "zod";

export const GUIDE_JSON_SCHEMA = "n2-guide/1";

const lang = z.enum(["fr", "en"]);
/** Texte dans une ou plusieurs langues (au moins une) */
const localized = <T extends z.ZodType>(t: T) =>
  z.object({ fr: t.optional(), en: t.optional() }).refine((v) => v.fr !== undefined || v.en !== undefined, "au moins une langue");
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);

const section = z.object({
  id: z.string().min(1),
  title: localized(z.string()).optional(),
});

const page = z.object({
  /** adresse dans le guide, sans « #/ » : « guide/observability » */
  key: z.string().min(1),
  component: z.string().optional(),
  /** commit du projet documenté avec lequel la page a été vérifiée */
  verifiedAgainst: sha.optional(),
  title: localized(z.string()),
  summary: localized(z.string()).optional(),
  sections: z.array(section),
  /** texte de la page : un arbre par langue (objets, listes, textes, nombres, booléens) */
  text: localized(z.unknown()),
  omitted: z.array(z.string()).optional(),
});

const revision = z.object({ date: localized(z.string()), commit: sha });

export const guideJson = z.object({
  schema: z.literal(GUIDE_JSON_SCHEMA),
  title: z.string(),
  inline: z.string(),
  langs: z.array(lang).min(1),
  source: z
    .object({ repository: z.string().optional(), commit: z.string().optional(), committedAt: z.string().optional(), dirty: z.boolean().optional() })
    .optional(),
  /** rédaction et révision du guide, avec les commits du projet documenté */
  revision: z.object({ written: revision.optional(), revised: revision.optional(), baseline: sha.optional() }).optional(),
  navigation: z.unknown().optional(),
  pages: z.array(page),
  glossary: z.array(
    z.object({
      id: z.string().min(1),
      text: localized(z.object({ term: z.string(), short: z.string().optional(), body: z.string().optional() })),
    }),
  ),
});

export type GuideJson = z.infer<typeof guideJson>;
export type GuideJsonPage = GuideJson["pages"][number];

/** Lit et vérifie un guide.json. Erreur lisible (chemin du premier champ en défaut) si le fichier n'a pas ce format. */
export function readGuideJson(raw: string): GuideJson {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`guide.json illisible : ${(e as Error).message}`);
  }
  const schema = typeof data === "object" && data !== null ? (data as { schema?: unknown }).schema : undefined;
  if (schema !== GUIDE_JSON_SCHEMA) throw new Error(`guide.json : format ${JSON.stringify(schema ?? null)} inconnu (attendu ${GUIDE_JSON_SCHEMA})`);
  const r = guideJson.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`guide.json : ${issue.path.join(".") || "(racine)"} : ${issue.message}`);
  }
  return r.data;
}
