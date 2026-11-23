// Passages des README et du guide dans le panneau de la carte.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { badge, button, count, Section, Skeleton } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { getLang, m } from "~/lib/i18n";
import { getDocMentions, getDocPassage } from "~/server/fns";
import { BookIcon, GuideLink, GuideMatches } from "~/features/guide/GuideLinks";
import { sectionsUnder } from "~/features/guide/logic";
import { ok, useGuide } from "~/lib/data";
import type { CodeMapData, DocHit, MapNode } from "~/server/types";
import type { PanelActions } from "../Panel";
import { Title } from "./common";

// ---------- Passage d'un README (choisi dans la recherche ou depuis une librairie) ----------
export function DocSection({ hit, act }: { hit: DocHit; act: PanelActions }) {
  const lang = getLang();
  const q = useQuery({ queryKey: ["doc", hit.key, lang], queryFn: () => getDocPassage({ data: { key: hit.key, lang } }), staleTime: 5 * 60_000 });
  const text = q.data?.ok ? q.data.data : null;
  return (
    <div className="impact-box">
      <div className="panel-head">
        <span className={badge({ tone: "info" })}>{m.map_doc_passage()}</span>
        <button type="button" className={button({ variant: "link" })} onClick={act.closeDoc}>
          {m.map_close()}
        </button>
      </div>
      <h4>{hit.title}</h4>
      <p className="mono small muted" title={hit.file}>
        {hit.file}
        {hit.line ? `:${hit.line}` : ""}
      </p>
      {q.isPending ? <Skeleton h={50} /> : <p className="desc doc-text">{text ?? hit.snippet}</p>}
      {hit.file && (
        <button type="button" className={button({ size: "sm" })} onClick={() => openInIde(hit.file!, hit.line)}>
          {m.map_doc_open()}
        </button>
      )}
    </div>
  );
}

// ---------- Passages des README et du guide qui citent une librairie ----------
export function LibDocs({ name, act }: { name: string; act: PanelActions }) {
  const lang = getLang();
  const q = useQuery({ queryKey: ["doc-mentions", name, lang], queryFn: () => getDocMentions({ data: { lib: name, lang } }), staleTime: 5 * 60_000 });
  const hits = q.data?.ok ? q.data.data : [];
  return (
    <Section id="map.libdocs" remember={false} title={<>{m.map_lib_docs()} {q.data?.ok && <span className={count}>{hits.length}</span>}</>}>
      {q.isPending && <Skeleton h={40} />}
      {q.data && !q.data.ok && <p className="muted small">{m.map_lib_docs_unavailable()}</p>}
      {q.data?.ok && !hits.length && <p className="muted small">{m.map_lib_docs_none()}</p>}
      <ul className="lib-rows">
        {hits.map((h) => (
          <li key={h.key}>
            {h.kind === "guide" && h.target ? (
              <GuideLink target={h.target} className="lib-row doc-row">
                <DocRow hit={h} />
              </GuideLink>
            ) : (
              <button type="button" className="lib-row doc-row" onClick={() => act.openDoc(h)}>
                <DocRow hit={h} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DocRow({ hit }: { hit: DocHit }) {
  return (
    <span>
      <strong className="doc-title">
        <BookIcon size={11} /> {hit.title}
      </strong>
      <span className="file-part">{hit.where}</span>
      {hit.snippet && <span className="doc-snippet">{hit.snippet}</span>}
    </span>
  );
}

// ---------- Sections du guide de l'équipe qui citent des fichiers d'un ou plusieurs dossiers ----------
export function GuideSection({ paths, hint }: { paths: string[]; hint: string }) {
  const guide = ok(useGuide());
  const key = paths.join("\n");
  const matches = useMemo(() => sectionsUnder(guide, key.split("\n")), [guide, key]);
  return (
    <Section id="map.guide" remember={false} title={<Title label={m.common_guide()} n={guide ? matches.length : undefined} />}>
      {!guide ? (
        <Skeleton h={40} />
      ) : matches.length ? (
        <>
          <p className="muted small">{hint}</p>
          <GuideMatches matches={matches} max={5} showFiles />
        </>
      ) : (
        <p className="muted small">{m.map_guide_none()}</p>
      )}
    </Section>
  );
}

/**
 * Dossiers (ou fichiers) à chercher dans le guide pour ces parties. Une partie « autres » ou « racine src » a pour chemin
 * tout son workspace, qui contient aussi les autres parties : on prend alors ses fichiers clés plutôt que le dossier entier.
 */
export function guidePaths(data: CodeMapData, parts: MapNode[]): string[] {
  const contains = (n: MapNode) => data.nodes.some((o) => o.id !== n.id && o.path.startsWith(`${n.path}/`));
  return [...new Set(parts.flatMap((n) => (contains(n) ? n.topFiles.map((f) => f.file) : [n.path])))];
}
