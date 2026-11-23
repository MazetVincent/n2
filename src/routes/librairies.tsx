import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { css } from "styled-system/css";
import { z } from "zod";
import { Badge, Card, Count, ExtLink, FitScroll, SourceView } from "~/components/ds";
import { LibDialog } from "~/features/libs/LibDialog";
import { alreadyInstalled, UpdatePrLink, useUpdatePrs } from "~/features/libs/UpdatePrs";
import { SEVERITY, UPDATE } from "~/features/libs/labels";
import { WorkspaceLibsCard } from "~/features/libs/WorkspaceLibsCard";
import { ok, useCodeMap, useLibs, useWorkspaceLibs } from "~/lib/data";
import { dateFr, plural } from "~/lib/format";
import { m, msg } from "~/lib/i18n";
import type { LibInfo } from "~/server/types";

// ?vue= : onglet affiché (librairies critiques par défaut) ; ?lib=nom : fiche agrandie ouverte
// (lien direct possible, Précédent revient en arrière)
const search = z.object({ vue: z.enum(["package-json"]).optional(), lib: z.string().max(214).optional() });
export const Route = createFileRoute("/librairies")({ validateSearch: search, component: LibsPage });
const rank = (l: LibInfo) => (l.advisories.length ? 0 : { major: 1, minor: 2, patch: 3, unknown: 4, none: 5 }[l.update]);

const th = css({ position: "sticky", top: 0, zIndex: 1, bg: "surface", textAlign: "left", fontSize: "xs", textTransform: "uppercase", letterSpacing: "0.04em", color: "muted", fontWeight: "semibold", p: "2", borderBottom: "1px solid token(colors.border)", boxShadow: "inset 0 -1px 0 token(colors.border)" });
const td = css({ p: "2", borderBottom: "1px solid token(colors.border)", verticalAlign: "top", "& > *": { mr: "1", mb: "1" } });

function LibsPage() {
  const { vue, lib } = Route.useSearch();
  const navigate = Route.useNavigate();
  const openLib = (name: string) => navigate({ search: (s) => ({ ...s, lib: name }) });
  const q = useLibs();
  const critical = useMemo(() => new Set(q.data?.ok ? q.data.data.map((l) => l.name) : []), [q.data]);
  // les dépendances par package.json ne sont demandées qu'à l'ouverture de leur onglet (centaines d'appels au registre npm)
  const ws = ok(useWorkspaceLibs(vue === "package-json"));
  const behind = q.data?.ok ? q.data.data.filter((l) => l.update !== "none").length : undefined;

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
      <nav aria-label={m.libs_library_views()} className={css({ display: "flex", gap: "1", borderBottom: "1px solid token(colors.border)" })}>
        <SubTab active={!vue} search={{ vue: undefined }} label={m.libs_critical_libraries()} count={behind !== undefined ? m.libs_update({ behind }) : undefined} />
        <SubTab active={vue === "package-json"} search={{ vue: "package-json" }} label={m.libs_dependencies_by_package_json()} count={ws ? String(ws.length) : undefined} />
      </nav>
      {vue === "package-json" ? <WorkspaceLibsCard critical={critical} onOpen={openLib} /> : <CriticalLibs onOpen={openLib} />}
      <LibDialog name={lib} onClose={() => navigate({ search: (s) => ({ ...s, lib: undefined }) })} />
    </div>
  );
}

function SubTab({ active, search, label, count }: { active: boolean; search: { vue?: "package-json" }; label: string; count?: string }) {
  return (
    <Link
      from={Route.fullPath}
      search={(s) => ({ ...s, ...search, lib: undefined })}
      aria-current={active ? "page" : undefined}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "2",
        px: "3",
        py: "2",
        mb: "-1px",
        fontWeight: "semibold",
        color: active ? "text" : "muted",
        textDecoration: "none",
        borderBottom: "2px solid",
        borderColor: active ? "accent" : "transparent",
        _hover: { color: "text" },
      })}
    >
      {label}
      {count && <Count>{count}</Count>}
    </Link>
  );
}

function CriticalLibs({ onOpen }: { onOpen: (name: string) => void }) {
  const q = useLibs();
  // nombre de parties de la carte qui utilisent chaque librairie (si la carte a déjà été analysée)
  const map = ok(useCodeMap(false));
  const partsOf = (name: string) => map?.nodes.filter((n) => n.libs.some((l) => l.name === name && l.files > 0)).length;
  const libs = q.data?.ok ? q.data.data : [];
  const behind = libs.filter((l) => l.update !== "none").length;
  const vulns = libs.reduce((n, l) => n + l.advisories.length, 0);
  // PR ouvertes (Renovate, Dependabot ou à la main) qui mettent à jour chaque librairie
  const { query: prQ, prsFor, ready } = useUpdatePrs();
  const withPr = libs.filter((l) => prsFor(l.name).some((pr) => !alreadyInstalled(pr, l.installed))).length;
  return (
    <Card
      title={m.libs_critical_libraries()}
      meta={
        q.data?.ok && (
          <>
            {behind} {m.libs_update_2()}
            {ready && withPr > 0 && <> · {m.libs_open_pr({ withPr })}</>} · {vulns ? <strong className={css({ color: "bad" })}>{plural(vulns, m.libs_security_alert(), m.libs_security_alerts())}</strong> : m.libs_no_security_alerts()}
          </>
        )
      }
    >
      <SourceView query={q}>
        {(data) => (
          // l'en-tête du tableau reste visible pendant que les lignes défilent
          <FitScroll className={css({ overflowX: "auto", mt: "1.5" })}>
            <table className={css({ w: "full", borderCollapse: "collapse" })}>
              <thead>
                <tr>
                  {[m.common_library(), m.libs_installed(), m.libs_latest_2(), m.libs_update_3(), m.libs_open_pr_2(), m.libs_security(), m.libs_new_versions(), m.libs_map()].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data]
                  .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
                  .map((l) => (
                    <tr key={l.name} className={css({ _hover: { bg: "surface.alt" } })}>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => onOpen(l.name)}
                          title={m.libs_open_details()}
                          className={css({ border: "none", bg: "transparent", p: 0, color: "text", fontWeight: "semibold", cursor: "pointer", textAlign: "left", _hover: { color: "accent", textDecoration: "underline" } })}
                        >
                          {l.name}
                        </button>
                      </td>
                      <td className={td}>
                        <span className="mono">{l.installed ?? "—"}</span>
                      </td>
                      <td className={td}>
                        <span className="mono">{l.latest ?? "—"}</span>
                      </td>
                      <td className={td}>
                        <Badge tone={UPDATE[l.update][1]}>{UPDATE[l.update][0]}</Badge>
                      </td>
                      <td className={td}>
                        {prsFor(l.name).length ? (
                          prsFor(l.name).map((pr) => <UpdatePrLink key={pr.url} pr={pr} lib={l.name} installed={l.installed} status />)
                        ) : (
                          <span
                            className={css({ color: "muted", fontSize: "sm" })}
                            title={prQ.data && !prQ.data.ok ? `${m.libs_prs_unavailable()} : ${msg(prQ.data.error.message)}` : undefined}
                          >
                            {prQ.data && !prQ.data.ok ? "?" : "—"}
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        {l.advisories.length ? (
                          l.advisories.map((a) => (
                            <ExtLink key={a.id} href={a.url} tone={SEVERITY[a.severity] ?? "warn"}>
                              ⚠ {a.severity} · {a.summary.slice(0, 60)}
                            </ExtLink>
                          ))
                        ) : (
                          <span className={css({ color: "muted", fontSize: "sm" })}>—</span>
                        )}
                      </td>
                      <td className={td}>
                        {l.releases.length ? (
                          l.releases.map((r) => (
                            <ExtLink key={r.name} href={r.url} tone="neutral">
                              {r.name.split("@").at(-1)} · {dateFr(r.publishedAt)}
                            </ExtLink>
                          ))
                        ) : l.update !== "none" && l.repoUrl ? (
                          <ExtLink href={l.repoUrl} tone="neutral">
                            {m.libs_view_releases()}
                          </ExtLink>
                        ) : (
                          <span className={css({ color: "muted", fontSize: "sm" })}>—</span>
                        )}
                      </td>
                      <td className={td}>
                        {/* Pour estimer le coût d'une montée de version : où la librairie est utilisée */}
                        <Link to="/carte" search={{ lib: l.name }} className={css({ fontSize: "sm", whiteSpace: "nowrap" })}>
                          {partsOf(l.name) !== undefined ? `${plural(partsOf(l.name)!, m.common_part())} →` : m.libs_view()}
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </FitScroll>
        )}
      </SourceView>
    </Card>
  );
}
