// Dépendances de chaque endroit du monorepo qui a un package.json, chacun activable d'un clic,
// regroupées comme sur la carte : une colonne par couche (Front, API, Back…), ses package.json en liste (pastilles
// activables du design system). La couche est allumée dès qu'un des siens l'est ; un clic sur elle les coupe tous
// (ou les active tous s'ils étaient tous coupés).
// Dans chaque couche (et dans les blocs affichés), du plus grand nombre de dépendances au plus petit.
// À l'arrivée, tout est affiché (« Tout masquer » proposé) ; seul le choix « Dépendances Prod | + dev » est retenu.
// Sans les dépendances de dev, les package.json qui n'ont plus rien à montrer disparaissent des filtres.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { Badge, badge, Button, Card, Segmented, SourceView, ToggleChip, type Tone } from "~/components/ds";
import { CATS, catLabel } from "~/features/map/model";
import { ok, useCodeMap, useWorkspaceLibs } from "~/lib/data";
import { m, trPart } from "~/lib/i18n";
import type { Category, WorkspaceDep, WorkspaceLibs } from "~/server/types";
import { groupByLayer, layerOfPackage, masonry } from "./layers";
import { UPDATE } from "./labels";
import { alreadyInstalled, UpdatePrLink, useUpdatePrs } from "./UpdatePrs";

const DEV_PREF = "n2.libs.showDev";

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* préférence non retenue */
  }
};

export function WorkspaceLibsCard({ critical, onOpen }: { critical: Set<string>; onOpen: (name: string) => void }) {
  const q = useWorkspaceLibs();
  const [hidden, setHidden] = useState<string[]>([]);
  const [showDev, setShowDev] = useState(true);
  // préférences lues après le premier rendu (le serveur ne connaît pas le localStorage)
  useEffect(() => {
    setShowDev(read<boolean>(DEV_PREF, true));
  }, []);

  const parts = useMemo(() => (q.data?.ok ? q.data.data : []), [q.data]);
  // couche de chaque package.json d'après la carte du code (sans carte : un seul groupe, sans couche)
  const map = ok(useCodeMap());
  const layers = useMemo(() => new Map(parts.map((p) => [p.path, map ? layerOfPackage(p.path, map.nodes) : null])), [parts, map]);
  // filtres proposés : sans les dépendances de dev, seuls les package.json qui ont encore des dépendances
  const filters = parts.filter((p) => showDev || shownDeps(p, false).length);
  const groups = groupByLayer(filters, (p) => layers.get(p.path) ?? null, (p) => shownDeps(p, showDev).length, CATS);
  const isChecked = (p: WorkspaceLibs) => !hidden.includes(p.path);
  const checked = filters.filter(isChecked);
  const allShown = checked.length === filters.length;
  // un bloc n'est affiché que s'il a au moins une dépendance à montrer (sans les dev si l'option est décochée),
  // dans l'ordre des filtres : par couche, puis du plus grand nombre de dépendances au plus petit
  const visible = groups.flatMap((g) => g.parts).filter((p) => isChecked(p) && shownDeps(p, showDev).length);

  const setGroup = (group: WorkspaceLibs[], on: boolean) => {
    const paths = new Set(group.map((p) => p.path));
    setHidden((h) => (on ? h.filter((x) => !paths.has(x)) : [...h.filter((x) => !paths.has(x)), ...paths]));
  };
  const libCount = new Set(visible.flatMap((p) => shownDeps(p, showDev).map((d) => d.name))).size;

  return (
    <Card title={m.libs_dependencies_by_package_json()} meta={q.data?.ok && `${visible.length}/${filters.length} package.json · ${libCount} ${m.libs_libraries()}`}>
      <SourceView query={q}>
        {() => (
          <>
            <div className={css({ display: "flex", alignItems: "flex-start", gap: "4", py: "2.5", borderBottom: "1px solid token(colors.border)", mdDown: { flexDirection: "column", gap: "2" } })}>
              {/* à gauche, comme sur la carte : une colonne par couche, ses package.json en liste ; un clic active ou coupe */}
              <div className={css({ flex: 1, minW: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "3", alignItems: "start" })}>
                {groups.map((g) => {
                  const deps = new Set(g.parts.flatMap((p) => shownDeps(p, showDev).map((d) => d.name))).size;
                  // couche allumée dès qu'un de ses package.json est actif
                  const active = g.parts.some(isChecked);
                  return (
                    <section key={g.layer ?? "autres"} aria-label={g.layer ? catLabel(g.layer) : m.libs_other()} className={css({ display: "flex", flexDirection: "column", gap: "1.5", minW: 0 })}>
                      {/* la couche : un clic coupe tous ses package.json (ou les active tous s'ils sont tous coupés) */}
                      <ToggleChip
                        level="group"
                        pressed={active}
                        onClick={() => setGroup(g.parts, !active)}
                        title={m.libs_package_json_libraries({ parts: g.parts.length, deps })}
                      >
                        <LayerDot layer={g.layer} />
                        {g.layer ? catLabel(g.layer) : m.libs_other()}
                      </ToggleChip>
                      <ul className={css({ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: "1" })}>
                        {g.parts.map((p) => {
                          const on = isChecked(p);
                          const n = shownDeps(p, showDev).length;
                          return (
                            <li key={p.path}>
                              <ToggleChip
                                pressed={on}
                                onClick={() => setHidden((h) => (on ? [...h, p.path] : h.filter((x) => x !== p.path)))}
                                title={`${p.path || m.libs_project_root()} (${p.name})${n ? "" : m.libs_no_dependencies()}`}
                              >
                                {trPart(p.label)}
                              </ToggleChip>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
              {/* à droite : les dépendances montrées (prod seules ou avec celles de dev), puis tout afficher / tout masquer */}
              <div className={css({ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2.5", whiteSpace: "nowrap", mdDown: { alignItems: "flex-start" } })}>
                <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                  <span className={css({ textStyle: "caption", color: "muted" })}>{m.libs_dependencies()}</span>
                  <Segmented
                    label={m.libs_dependencies()}
                    value={showDev ? "dev" : "prod"}
                    onChange={(v) => {
                      setShowDev(v === "dev");
                      save(DEV_PREF, v === "dev");
                    }}
                    items={[
                      { value: "prod", label: m.libs_deps_prod() },
                      { value: "dev", label: m.libs_deps_with_dev() },
                    ]}
                  />
                </div>
                <Button variant="link" size="xs" onClick={() => setHidden(allShown ? parts.map((p) => p.path) : [])}>
                  {allShown ? m.libs_hide_all() : m.libs_show_all()}
                </Button>
              </div>
            </div>
            {visible.length ? (
              <Masonry heights={visible.map((p) => blockHeight(p, showDev))}>
                {visible.map((p) => (
                  <Part key={p.path} part={p} layer={layers.get(p.path) ?? null} showDev={showDev} critical={critical} onOpen={onOpen} />
                ))}
              </Masonry>
            ) : (
              <p className={css({ color: "muted", fontSize: "md", py: "3" })}>
                {checked.length
                  ? m.libs_no_libraries_show_selected_package()
                  : m.libs_select_at_least_one_package()}
              </p>
            )}
          </>
        )}
      </SourceView>
    </Card>
  );
}

const shownDeps = (part: WorkspaceLibs, showDev: boolean) => part.deps.filter((d) => showDev || !d.dev);

// Hauteur estimée d'un bloc (en-tête, description sur 2 lignes, lignes de 27 px, liste limitée à 360 px) :
// assez juste pour répartir les blocs entre les colonnes sans les mesurer
const blockHeight = (part: WorkspaceLibs, showDev: boolean) => 46 + (part.description ? 36 : 0) + Math.min(shownDeps(part, showDev).length * 27 + 8, 368);

const COL_MIN = 320;
const COL_GAP = 12;

/**
 * Blocs en colonnes « maçonnerie » sur toute la largeur : autant de colonnes de 320 px minimum que la place
 * le permet (recalculé quand la largeur change), chaque bloc dans la colonne la moins haute.
 * Avec moins de blocs que de colonnes, les blocs s'élargissent pour occuper toute la largeur.
 * (Les colonnes CSS laissaient de la place vide à droite et ne se réorganisaient pas après un filtre.)
 */
function Masonry({ heights, children }: { heights: number[]; children: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setCols(Math.max(1, Math.floor((el.clientWidth + COL_GAP) / (COL_MIN + COL_GAP))));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const columns = masonry(heights, cols);
  return (
    <div ref={ref} className={css({ display: "grid", gap: "3", mt: "3", alignItems: "start" })} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((items, i) => (
        <div key={i} className={css({ display: "flex", flexDirection: "column", gap: "3", minW: 0 })}>
          {items.map((j) => children[j])}
        </div>
      ))}
    </div>
  );
}

/** Pastille de la couche, à sa couleur sur la carte (gris : sans couche connue) */
const LayerDot = ({ layer }: { layer: Category | null }) => (
  <span aria-hidden className={css({ flex: "none", display: "inline-block", w: "8px", h: "8px", borderRadius: "full" })} style={{ background: layer ? `var(--colors-cat-${layer})` : "var(--colors-muted)" }} />
);

function Part({ part, layer, showDev, critical, onOpen }: { part: WorkspaceLibs; layer: Category | null; showDev: boolean; critical: Set<string>; onOpen: (name: string) => void }) {
  const all = shownDeps(part, showDev);
  const { prsFor } = useUpdatePrs();
  // PR encore utiles (pas celles qui visent une version déjà installée)
  const openPrs = (d: WorkspaceDep) => (d.private ? [] : prsFor(d.name).filter((pr) => !alreadyInstalled(pr, d.installed)));
  const isLate = (d: WorkspaceDep) => d.update === "major" || d.update === "minor";
  const late = all.filter(isLate).length;
  const withPr = all.filter((d) => openPrs(d).length).length;
  // clic sur « N en retard » ou « N PR » : seulement ces dépendances (nouveau clic : toutes)
  const [only, setOnly] = useState<"late" | "pr" | null>(null);
  const filter = (only === "late" && !late) || (only === "pr" && !withPr) ? null : only;
  const deps = filter === "late" ? all.filter(isLate) : filter === "pr" ? all.filter((d) => openPrs(d).length) : all;
  return (
    <section className={css({ display: "block", w: "full", border: "1px solid token(colors.border)", borderRadius: "lg", bg: "surface.alt", minW: 0 })}>
      <header className={css({ px: "3", pt: "2.5", pb: "2", borderBottom: "1px solid token(colors.border)" })}>
        <div className={css({ display: "flex", alignItems: "baseline", gap: "2" })}>
          <strong className={css({ fontSize: "base", flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "1.5", alignSelf: "center" })} title={layer ? catLabel(layer) : undefined}>
            {layer && <LayerDot layer={layer} />}
            {trPart(part.label)}
          </strong>
          <span title={part.name} className={css({ flex: 1, minW: 0, fontSize: "xs", color: "muted", fontFamily: "mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
            {part.path ? `${part.path}/package.json` : m.libs_package_json_root()}
          </span>
          {late > 0 && (
            <FilterBadge tone="warn" active={filter === "late"} onClick={() => setOnly(filter === "late" ? null : "late")} title={m.libs_show_only_dependencies_behind_major()}>
              {m.libs_behind({ late })}
            </FilterBadge>
          )}
          {withPr > 0 && (
            <FilterBadge tone="accent" active={filter === "pr"} onClick={() => setOnly(filter === "pr" ? null : "pr")} title={m.libs_show_only_dependencies_open_update()}>
              {withPr} PR
            </FilterBadge>
          )}
        </div>
        {part.description && (
          <p className={css({ fontSize: "sm", color: "muted", mt: "1", lineClamp: 2 })} title={part.description}>
            {part.description}
          </p>
        )}
      </header>
      <ul className={css({ listStyle: "none", m: 0, p: "1", maxH: "360px", overflowY: "auto" })}>
        {deps.map((d) => (
          <li key={`${d.name}:${d.dev}`} className={css({ display: "flex", alignItems: "center", gap: "1" })}>
            <DepRow dep={d} critical={critical.has(d.name)} onOpen={onOpen} />
            {/* lien à côté du bouton (pas dedans : un lien dans un bouton n'est pas cliquable proprement) */}
            {openPrs(d).map((pr) => (
              <UpdatePrLink key={pr.url} pr={pr} lib={d.name} compact />
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Badge cliquable qui filtre les dépendances d'un package.json (enfoncé quand le filtre est actif) */
function FilterBadge({ tone, active, onClick, title, children }: { tone: Tone; active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={active ? m.libs_show_all_dependencies() : title}
      className={css(badge.raw({ tone, interactive: true }), { flex: "none" })}
    >
      {children}
      {active && " ×"}
    </button>
  );
}

function DepRow({ dep, critical, onOpen }: { dep: WorkspaceDep; critical: boolean; onOpen: (name: string) => void }) {
  const [label, tone] = UPDATE[dep.update];
  return (
    <button
      type="button"
      onClick={() => onOpen(dep.name)}
      title={`${dep.name}${m.libs_requested()} ${dep.range}${dep.installed ? `, ${m.libs_installed_2()} ${dep.installed}` : ""}${dep.latest ? `, ${m.libs_latest()} ${dep.latest}` : ""}`}
      className={css({
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: "2",
        flex: 1,
        minW: 0,
        w: "full",
        px: "2",
        py: "1",
        border: "none",
        borderRadius: "md",
        bg: "transparent",
        color: "text",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "sm",
        _hover: { bg: "accent.soft" },
        _focusVisible: { bg: "accent.soft", outline: "none" },
      })}
    >
      <span className={css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: critical ? "semibold" : "normal" })}>
        {critical && <span title={m.libs_critical_library()}>★ </span>}
        {dep.name}
        {dep.dev && <span className={css({ color: "muted", fontSize: "xs" })}> · dev</span>}
      </span>
      <span className={css({ fontFamily: "mono", fontSize: "xs", color: "muted" })}>{dep.installed ?? dep.range}</span>
      {dep.private ? <Badge title={m.libs_private_registry_no_version_check()}>{m.libs_private()}</Badge> : dep.update === "none" ? <span className={css({ w: "1" })} /> : <Badge tone={tone}>{label}</Badge>}
    </button>
  );
}
