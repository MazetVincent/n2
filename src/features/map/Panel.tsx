// Panneau latéral de la carte : vue d'ensemble, partie (et sous-dossier), librairie, couche, impact.
// Partie, sous-dossier, couche et librairie suivent le même plan, dans cet ordre :
// À quoi ça sert · Dans le guide · Librairies · Interactions · Fichiers les plus importants.
// Les deux premières sections sont ouvertes, les autres fermées ; chaque nouvelle sélection repart de cet état.
// Chaque vue du panneau est dans panel/ : vue d'ensemble, partie, librairie, couche, impact, passages de doc.
import type { BranchData, Category, CodeMapData, DocHit } from "~/server/types";
import { type Selection } from "./model";
import { DocSection } from "./panel/docs";
import { ImpactSection } from "./panel/impact";
import { LayerPanel } from "./panel/layer";
import { LibPanel } from "./panel/library";
import { NodePanel } from "./panel/node";
import { Overview } from "./panel/overview";

export interface PanelActions {
  select: (id: string, opts?: { sub?: string | null; openLib?: string | null }) => void;
  query: (lib: string) => void;
  layer: (c: Category) => void;
  /** fiche d'une librairie à la place de la liste « Librairies » de la partie (null : retour à la liste) */
  focusLib: (lib: string | null) => void;
  close: () => void;
  impact: (file: string | null) => void;
  hover: (id: string | null) => void;
  /** passage de README affiché en haut du panneau */
  openDoc: (hit: DocHit) => void;
  closeDoc: () => void;
}

export interface PanelProps {
  data: CodeMapData;
  sel: Selection;
  tests: boolean;
  impactFile: string | null;
  doc?: DocHit | null;
  branch?: BranchData;
  /** interrupteur « Ma branche » allumé : ce que la branche touche passe en premier dans le panneau, ouvert */
  branchOn?: boolean;
  act: PanelActions;
}

export function Panel(props: PanelProps) {
  const { data, sel, impactFile } = props;
  // la clé remonte le contenu à chaque sélection : les sections repartent de leur état de base
  const body = sel.selected ? (
    <NodePanel key={`n:${sel.selected}:${sel.sub ?? ""}`} {...props} node={data.nodes.find((n) => n.id === sel.selected)} />
  ) : sel.query ? (
    <LibPanel key={`l:${sel.query}`} {...props} />
  ) : sel.layer ? (
    <LayerPanel key={`c:${sel.layer}`} {...props} />
  ) : (
    <Overview {...props} />
  );
  return (
    <aside className="map-panel" onPointerOver={(e) => props.act.hover((e.target as HTMLElement).closest<HTMLElement>("[data-hover]")?.dataset.hover ?? null)} onPointerLeave={() => props.act.hover(null)}>
      {props.doc && <DocSection hit={props.doc} act={props.act} />}
      {impactFile && <ImpactSection {...props} file={impactFile} />}
      {body}
    </aside>
  );
}
