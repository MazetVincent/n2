// Noms des environnements de branche (partagé par le serveur et l'interface).

/** Ticket de la branche (« feat/ABC-123-panier » → « abc-123 »), sinon le nom de branche nettoyé : la partie variable des noms de pipeline */
export function branchSlug(branch: string): string {
  const clean = branch
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 24)
    .replace(/-+$/, "")
    .toLowerCase();
  return clean.match(/[a-z]{2,6}-[0-9]{1,6}/)?.[0] ?? clean;
}

/** Nom de pipeline « monprojet-abc-123-pipeline-Pipeline…-XYZ » → « abc-123 » (null si ce n'est pas un pipeline du projet) */
export function pipelineSlug(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null;
  return name.slice(prefix.length).match(/^(.+?)-pipeline(?:-|$)/)?.[1] ?? null;
}
