import { useQuery } from "@tanstack/react-query";
import { badge, button, Skeleton } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { plural } from "~/lib/format";
import { m, msg, trPart } from "~/lib/i18n";
import { getImpact } from "~/server/fns";
import { GuideForFiles } from "~/features/guide/GuideLinks";
import { useEditorName } from "~/features/prefs/useEditorName";
import type { PanelProps } from "../Panel";

// ---------- Analyse d'impact : modifier ce fichier touche quoi ? ----------
export function ImpactSection({ data, file, act }: PanelProps & { file: string }) {
  const editor = useEditorName();
  const q = useQuery({ queryKey: ["impact", file], queryFn: () => getImpact({ data: { file } }), staleTime: 5 * 60_000 });
  const d = q.data?.ok ? q.data.data : null;
  const max = Math.max(1, ...(d?.levels ?? [1]));
  return (
    <div className="impact-box">
      <div className="panel-head">
        <span className={badge({ tone: "warn" })}>Impact</span>
        <button type="button" className={button({ variant: "link" })} onClick={() => act.impact(null)}>
          {m.map_close_impact()}
        </button>
      </div>
      <p className="mono small" title={file}>
        {file}
      </p>
      {q.isPending && <Skeleton h={50} />}
      {q.data && !q.data.ok && <p className="muted small">{msg(q.data.error.message)}</p>}
      {d && (
        <>
          <p className="desc">
            {m.map_changing_file_affects()}
            <strong>{plural(d.direct, m.common_file(), m.common_files_2())}</strong>
            {m.map_directly()}
            <strong>{plural(d.total, m.common_file(), m.common_files_2())}</strong>
            {m.map_transitively_across()}
            <strong>{plural(Object.keys(d.byNode).length, m.common_part(), m.map_parts_2())}</strong>.
          </p>
          {d.levels.length > 0 && (
            <div className="impact-levels" title={m.map_number_files_at_each_dependency()}>
              {d.levels.map((n, i) => (
                <span key={i} style={{ height: `${Math.max(8, (n / max) * 100)}%` }} title={m.map_level_files({ i: i + 1, n })} />
              ))}
            </div>
          )}
          <ul className="lib-rows">
            {Object.entries(d.byNode)
              .sort((a, b) => b[1] - a[1])
              .map(([id, n]) => (
                <li key={id}>
                  <button type="button" className="lib-row" data-hover={id} onClick={() => act.select(id)}>
                    <span>
                      <i className={`dot cat-${data.nodes.find((x) => x.id === id)?.category ?? "shared"}`} />
                      {trPart(data.nodes.find((x) => x.id === id)?.label ?? id)}
                    </span>
                    <span className="muted small">{plural(n, m.common_file(), m.common_files_2())}</span>
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" className={button({ size: "sm" })} onClick={() => openInIde(file)}>
            {m.map_open_in({ editor })}
          </button>
        </>
      )}
      <GuideForFiles files={[file]} max={4} className="impact-guide" title={<h4>{m.common_guide()}</h4>} />
    </div>
  );
}
