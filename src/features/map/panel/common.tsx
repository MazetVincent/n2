// Éléments communs du panneau de la carte : en-tête, colonnes, chiffres clés, description, librairies, échanges, fichiers.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "styled-system/css";
import { badge, button, count } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { plural } from "~/lib/format";
import { m, trPart } from "~/lib/i18n";
import { useEditorName } from "~/features/prefs/useEditorName";
import type { Category, CodeMapData, ImportantFile, MapNode } from "~/server/types";
import { CATS, catLabel, libLabel } from "../model";
import type { PanelActions } from "../Panel";

export function StickyHead({ badge, title, subs, act }: { badge: ReactNode; title: ReactNode; subs?: ReactNode; act: PanelActions }) {
  return (
    <div className="panel-sticky">
      <div className="panel-head">
        {badge}
        <button type="button" className={button({ variant: "link" })} onClick={act.close}>
          {m.map_close()}
        </button>
      </div>
      <h3 className="panel-title">{title}</h3>
      {subs}
    </div>
  );
}

/** Les deux colonnes du panneau agrandi : « À quoi ça sert » et le guide à gauche, le reste à droite */
export const Cols = ({ left, right }: { left: ReactNode; right: ReactNode }) => (
  <div className="pcols">
    <div>{left}</div>
    <div>{right}</div>
  </div>
);

export const Title = ({ label, n }: { label: ReactNode; n?: number }) => (
  <>
    {label} {n !== undefined && <span className={count}>{n}</span>}
  </>
);

export const CatBadge = ({ c, act }: { c: Category; act: PanelActions }) => (
  <button type="button" className={cx(badge(), `cat-badge cat-${c}`)} onClick={() => act.layer(c)} title={m.map_view_whole_layer({ c: catLabel(c) })}>
    {catLabel(c)}
  </button>
);

/** Chiffres clés en tête de « À quoi ça sert » */
export function Kpis({ items }: { items: { value: number | string; label: string; hint?: string }[] }) {
  return (
    <dl className="kpis">
      {items.map((k) => (
        <div key={k.label} title={k.hint}>
          <dt>{k.label}</dt>
          <dd>{k.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Texte long replié sur quelques lignes */
export function Desc({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  // « Lire la suite » seulement si le texte dépasse vraiment les 5 lignes (la largeur dépend du panneau)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || all) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, all]);
  return (
    <>
      <p ref={ref} className={cx("desc", !all && "clamp")}>{text}</p>
      {long && (
        <button type="button" className={cx(button({ variant: "link" }), "more")} onClick={() => setAll((v) => !v)}>
          {all ? m.map_read_less() : m.map_read_more()}
        </button>
      )}
    </>
  );
}

/** Répartition des fichiers par couche : barre empilée + légende */
export function MixBar({ mix }: { mix: MapNode["mix"] }) {
  const cats = CATS.filter((c) => mix[c]);
  const total = cats.reduce((a, c) => a + (mix[c] ?? 0), 0) || 1;
  const pct = (c: Category) => {
    const p = Math.round(((mix[c] ?? 0) / total) * 100);
    return p ? `${p} %` : "< 1 %";
  };
  if (cats.length < 2) return null;
  return (
    <div className="mixbox">
      <div className="mixbar" role="img" aria-label={cats.map((c) => `${catLabel(c)} ${pct(c)}`).join(", ")}>
        {cats.map((c) => (
          <i key={c} className={`mix cat-${c}`} style={{ flexGrow: mix[c] }} />
        ))}
      </div>
      <div className="map-legend">
        {cats.map((c) => (
          <span key={c}>
            <i className={`dot cat-${c}`} />
            {catLabel(c)} {pct(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Liste de librairies avec barre d'usage ; le clic ouvre la fiche (dans la partie) ou la vue librairie (couche) */
export function LibRows({ libs, onPick }: { libs: { name: string; n: number }[]; onPick: (name: string) => void }) {
  if (!libs.length) return <p className="muted small">{m.map_no_external_library()}</p>;
  const max = Math.max(1, ...libs.map((l) => l.n));
  return (
    <ul className="lib-rows">
      {libs.map((l) => (
        <li key={l.name}>
          <button type="button" className="lib-row" onClick={() => onPick(l.name)}>
            <span>{libLabel(l.name)}</span>
            <span className="lib-bar">
              <i style={{ width: `${Math.round((l.n / max) * 100)}%` }} />
            </span>
            <span className="muted small">{l.n}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Appelants (in) et appelés (out), numérotés dans le sens du flux comme sur la carte */
export function Flow({ who, inc, out }: { who: string; inc: ReactNode[]; out: ReactNode[] }) {
  return (
    <>
      <p className="muted small flow">
        {m.map_called_by()}
        <span className="num num-in">n</span> → <strong>{who}</strong> → {m.map_calls()}
        <span className="num num-out">n</span>
      </p>
      <h4>
        {m.map_called_by_2()} <span className={count}>{inc.length}</span>
      </h4>
      {inc.length ? <div className="chip-list">{inc}</div> : <p className="muted small">—</p>}
      <h4>
        {m.map_calls_2()} <span className={count}>{out.length}</span>
      </h4>
      {out.length ? <div className="chip-list">{out}</div> : <p className="muted small">—</p>}
    </>
  );
}

export function FileRows({ files, data, act, showPart = true }: { files?: ImportantFile[]; data: CodeMapData; act: PanelActions; showPart?: boolean }) {
  const editor = useEditorName();
  if (!files?.length) return <p className="muted small">—</p>;
  return (
    <ul className="lib-rows">
      {files.map((f) => {
        const node = data.nodes.find((n) => n.id === f.node);
        return (
          <li key={f.file} className="file-item">
            <button type="button" className="lib-row file-row" data-hover={f.node} title={f.file} onClick={() => act.select(f.node)}>
              <span>
                <span className="mono">{f.file.split("/").slice(-2).join("/")}</span>
                {showPart && node && (
                  <span className="file-part">
                    <i className={`dot cat-${node.category}`} />
                    {trPart(node.label)}
                  </span>
                )}
              </span>
              <span className="muted small" title={m.map_imported_by_files_other_part({ importers: f.importers, fromParts: f.fromParts })}>
                {m.map_files({ importers: f.importers })}
                {f.fromParts ? ` · ${plural(f.fromParts, m.common_part())}` : ""}
              </span>
            </button>
            <button type="button" className={button({ size: "sm" })} onClick={() => act.impact(f.file)} title={m.map_what_depends_file_transitively()}>
              Impact
            </button>
            <button type="button" className={button({ size: "sm" })} onClick={() => openInIde(f.file)} title={m.map_open_in({ editor })}>
              {editor}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
