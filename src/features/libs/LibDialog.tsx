// Fiche agrandie d'une librairie : à quoi elle sert, dernières nouvelles, utilisation dans le projet.
// Fenêtre modale Ark UI ; elle suit le paramètre ?lib= de l'URL (lien direct, bouton Précédent).
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { Badge, ExtLink, Icon, IconButton, overlay, Skeleton } from "~/components/ds";
import { Example } from "~/features/map/panel/library";
import { ok, useCodeMap, useWorkspaceLibs } from "~/lib/data";
import { dayFr, plural } from "~/lib/format";
import { m, msg, trPart } from "~/lib/i18n";
import { updateKind } from "~/lib/semver";
import { getExamples, getLibOverview } from "~/server/fns";
import type { LibOverview, MapNode } from "~/server/types";
import { SEVERITY, UPDATE } from "./labels";
import { UpdatePrLink, useUpdatePrs } from "./UpdatePrs";

export function LibDialog({ name, onClose }: { name: string | undefined; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(name)} onOpenChange={(d) => !d.open && onClose()} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={overlay.backdrop} />
        <Dialog.Positioner className={overlay.positioner({ align: "scroll" })}>
          <Dialog.Content className={overlay.dialog({ size: "lg" })}>
            {name && <Sheet name={name} />}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

const sectionTitle = css({ fontSize: "sm", textTransform: "uppercase", letterSpacing: "0.05em", color: "muted", fontWeight: "bold", mb: "2" });

function Sheet({ name }: { name: string }) {
  const q = useQuery({ queryKey: ["lib-overview", name], queryFn: () => getLibOverview({ data: { name } }), staleTime: 60 * 60_000 });
  const o = q.data?.ok ? q.data.data : undefined;
  const d = o?.details;
  const update = d ? (d.installed && d.latest ? updateKind(d.installed, d.latest) : null) : null;
  const prs = useUpdatePrs().prsFor(name);

  return (
    <>
      <header className={css({ display: "flex", alignItems: "flex-start", gap: "3", px: "5", pt: "4", pb: "3.5", borderBottom: "1px solid token(colors.border)" })}>
        <div className={css({ flex: 1, minW: 0 })}>
          <Dialog.Title className={css({ textStyle: "title", overflowWrap: "anywhere" })}>{name}</Dialog.Title>
          <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2", mt: "1.5", fontSize: "sm", color: "muted" })}>
            {d?.installed && (
              <span>
                {m.libs_installed()} <span className="mono">{d.installed}</span>
              </span>
            )}
            {d?.latest && (
              <span>
                · {m.libs_latest()} <span className="mono">{d.latest}</span>
              </span>
            )}
            {update && <Badge tone={UPDATE[update][1]}>{UPDATE[update][0]}</Badge>}
            {!d?.private && prs.map((pr) => <UpdatePrLink key={pr.url} pr={pr} lib={name} installed={d?.installed} />)}
            {d?.license && <span>· {m.common_license()} {d.license}</span>}
            {d?.private && <Badge>{m.libs_private_registry()}</Badge>}
          </div>
        </div>
        <div className={css({ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "1.5", maxW: "50%" })}>
          {d?.docsUrl && (
            <ExtLink href={d.docsUrl} tone="info">
              Documentation ↗
            </ExtLink>
          )}
          {d?.npmUrl && (
            <ExtLink href={d.npmUrl} tone="neutral">
              npm ↗
            </ExtLink>
          )}
          {d?.repoUrl && (
            <ExtLink href={d.repoUrl} tone="neutral">
              {m.libs_source_code()} ↗
            </ExtLink>
          )}
        </div>
        <Dialog.CloseTrigger asChild>
          <IconButton label={m.libs_close()}>
            <Icon name="close" size={16} />
          </IconButton>
        </Dialog.CloseTrigger>
      </header>

      <div className={css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "minmax(0, 5fr) minmax(0, 6fr)" }, gap: "5", px: "5", py: "4" })}>
        <div className={css({ display: "flex", flexDirection: "column", gap: "5", minW: 0 })}>
          <section>
            <h3 className={sectionTitle}>{m.libs_what_does()}</h3>
            {q.isPending ? <Skeleton h={70} /> : q.data && !q.data.ok ? <p className={css({ color: "bad", fontSize: "md" })}>{msg(q.data.error.message)}</p> : o && <About o={o} />}
          </section>
          <section>
            <h3 className={sectionTitle}>{m.libs_latest_news()}</h3>
            {q.isPending ? <Skeleton h={120} /> : o && <News o={o} />}
          </section>
        </div>
        <section className={css({ minW: 0 })}>
          <h3 className={sectionTitle}>{m.libs_usage_project()}</h3>
          <Usage name={name} />
        </section>
      </div>
    </>
  );
}

function About({ o }: { o: LibOverview }) {
  const { details: d, about } = o;
  if (d.private) return <p className={css({ fontSize: "md", fontStyle: "italic", color: "muted" })}>{m.libs_package_from_company_s_private()}</p>;
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "2", fontSize: "md" })}>
      <p>{d.summary ?? m.common_no_published_description()}</p>
      {about && about !== d.summary && (
        <p className={css({ color: "muted", fontSize: "md" })}>
          {about} <span className={css({ fontSize: "xs" })}>{m.libs_from_readme()}</span>
        </p>
      )}
    </div>
  );
}

function News({ o }: { o: LibOverview }) {
  const { advisories, news, newsUrl, details } = o;
  if (details.private) return <p className={css({ fontSize: "md", color: "muted" })}>{m.libs_private_registry_no_public_release()}</p>;
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
      {advisories.map((a) => (
        <div key={a.id} className={css({ p: "2.5", borderRadius: "lg", bg: "bad.soft" })}>
          <ExtLink href={a.url} tone={SEVERITY[a.severity] ?? "warn"}>
            ⚠ {m.libs_security_advisory()} · {a.severity}
          </ExtLink>
          <p className={css({ fontSize: "sm", mt: "1" })}>{a.summary}</p>
        </div>
      ))}
      {news.length ? (
        <ul className={css({ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: "2" })}>
          {news.map((r) => (
            <li key={r.name} className={css({ borderLeft: "3px solid", borderColor: r.newer ? "accent" : "border", pl: "3", py: "0.5" })}>
              <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2" })}>
                <ExtLink href={r.url} className={css({ fontWeight: "semibold", fontFamily: "mono", fontSize: "sm", textDecoration: "none", _hover: { color: "accent" } })}>
                  {r.name.split("@").at(-1)} ↗
                </ExtLink>
                <span className={css({ fontSize: "sm", color: "muted" })}>{dayFr(r.publishedAt)}</span>
                {r.newer && <Badge tone="accent">{m.libs_not_use_yet()}</Badge>}
              </div>
              {r.excerpt && <p className={css({ fontSize: "sm", color: "muted", mt: "0.5" })}>{r.excerpt}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={css({ fontSize: "md", color: "muted" })}>{m.libs_no_release_notes_published_github()}</p>
      )}
      {newsUrl && (
        <ExtLink href={newsUrl} tone="neutral" className={css({ alignSelf: "flex-start" })}>
          {m.libs_all_releases()} ↗
        </ExtLink>
      )}
    </div>
  );
}

// ---------- Utilisation : parties qui la déclarent, parties de la carte qui l'importent, exemples ----------
function Usage({ name }: { name: string }) {
  const ws = ok(useWorkspaceLibs());
  const mapQ = useCodeMap(true);
  const map = ok(mapQ);
  const declared = (ws ?? []).flatMap((p) => p.deps.filter((d) => d.name === name).map((d) => ({ part: p, dep: d })));
  const importers = (map?.nodes ?? [])
    .map((n) => ({ node: n, lib: n.libs.find((l) => l.name === name) }))
    .filter((x): x is { node: MapNode; lib: NonNullable<typeof x.lib> } => Boolean(x.lib && x.lib.files + x.lib.testFiles > 0))
    .sort((a, b) => b.lib.files - a.lib.files || b.lib.testFiles - a.lib.testFiles);
  const totalFiles = importers.reduce((s, x) => s + x.lib.files, 0);
  const [open, setOpen] = useState<string | null | undefined>(undefined); // undefined = la première partie est ouverte
  const openId = open === undefined ? (importers[0]?.node.id ?? null) : open;

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
      <Block title={m.libs_declared({ parts: m.common_parts_count({ count: declared.length }) })}>
        {ws === undefined ? (
          <Skeleton h={40} />
        ) : declared.length ? (
          <ul className={css({ listStyle: "none", m: 0, p: 0, display: "flex", flexWrap: "wrap", gap: "1.5" })}>
            {declared.map(({ part, dep }) => (
              <li key={`${part.path}:${dep.dev}`} title={part.path || m.libs_project_root()} className={css({ display: "inline-flex", alignItems: "center", gap: "1.5", px: "2", py: "1", border: "1px solid token(colors.border)", borderRadius: "lg", bg: "surface.alt", fontSize: "sm" })}>
                <strong>{trPart(part.label)}</strong>
                <span className="mono">{dep.installed ?? dep.range}</span>
                {dep.dev && <span className={css({ color: "muted", fontSize: "xs" })}>dev</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className={css({ fontSize: "md", color: "muted" })}>{m.libs_not_any_package_json_indirect()}</p>
        )}
      </Block>

      <Block
        title={
          map
            ? m.libs_imported_by({ files: m.common_files_count({ count: totalFiles }), parts: m.common_parts_count({ count: importers.length }) })
            : m.libs_imported_code()
        }
        action={
          <Link to="/carte" search={{ lib: name }} className={css({ fontSize: "sm" })}>
            {m.libs_view_map()} →
          </Link>
        }
      >
        {mapQ.isPending || (mapQ.isFetching && !map) ? (
          <Skeleton h={90} />
        ) : !map ? (
          <p className={css({ fontSize: "md", color: "muted" })}>{m.libs_code_map_unavailable()}</p>
        ) : importers.length ? (
          <ul className="map-root" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {importers.map(({ node, lib }) => {
              const isOpen = openId === node.id;
              return (
                <li key={node.id} className={css({ border: "1px solid token(colors.border)", borderRadius: "lg", overflow: "hidden" })}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : node.id)}
                    className={css({ display: "flex", alignItems: "center", gap: "2", w: "full", px: "2.5", py: "1.5", border: "none", bg: "surface.alt", cursor: "pointer", textAlign: "left", fontSize: "md", _hover: { color: "accent" } })}
                  >
                    <span className={css({ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none", color: "muted" })}>▸</span>
                    <strong className={css({ flex: 1, minW: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{trPart(node.label)}</strong>
                    <span className={css({ color: "muted", fontSize: "sm", whiteSpace: "nowrap" })}>
                      {plural(lib.files, m.common_file(), m.common_files_2())}
                      {lib.testFiles ? ` + ${lib.testFiles} test${lib.testFiles > 1 ? "s" : ""}` : ""}
                    </span>
                  </button>
                  {isOpen && <NodeExamples nodeId={node.id} lib={name} tests={lib.files === 0} />}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={css({ fontSize: "md", color: "muted" })}>{m.libs_no_project_file_imports_directly()}</p>
        )}
      </Block>
    </div>
  );
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className={css({ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2", mb: "1.5" })}>
        <h4 className={css({ fontSize: "md", fontWeight: "semibold" })}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function NodeExamples({ nodeId, lib, tests }: { nodeId: string; lib: string; tests: boolean }) {
  const q = useQuery({ queryKey: ["examples", nodeId, lib, tests], queryFn: () => getExamples({ data: { node: nodeId, lib, tests } }), staleTime: 5 * 60_000 });
  return (
    <div className={css({ p: "2", display: "flex", flexDirection: "column", gap: "2" })}>
      {q.isPending && <Skeleton h={80} />}
      {q.data && !q.data.ok && <p className={css({ fontSize: "sm", color: "muted" })}>{msg(q.data.error.message)}</p>}
      {q.data?.ok && (q.data.data.length ? q.data.data.map((ex) => <Example key={`${ex.file}:${ex.line}`} ex={ex} />) : <p className={css({ fontSize: "sm", color: "muted" })}>{m.libs_no_readable_example()}</p>)}
    </div>
  );
}
