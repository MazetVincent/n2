// Lecture d'un littéral d'objet JavaScript (le contenu du guide est compilé dans son JS, sous forme d'objets).
// On ne l'exécute jamais : ce petit analyseur lit les objets, tableaux, textes, nombres et booléens,
// et remplace tout le reste (variables, appels, fonctions) par une référence { $ref: "…" } sans l'évaluer.

export type Literal = string | number | boolean | null | undefined | Literal[] | { [key: string]: Literal } | Ref;
export interface Ref {
  $ref: string;
}

export const isRef = (v: unknown): v is Ref => typeof v === "object" && v !== null && "$ref" in v && Object.keys(v).length === 1;
export const isObject = (v: unknown): v is Record<string, Literal> => typeof v === "object" && v !== null && !Array.isArray(v) && !isRef(v);

class LiteralError extends Error {}

const IDENT = /[\w$]/;

/** Lit le littéral qui commence à `start` (après d'éventuels espaces). Renvoie la valeur et la position qui suit. */
export function readLiteral(src: string, start: number): { value: Literal; end: number } {
  const p = new Parser(src, start);
  const value = p.value();
  return { value, end: p.i };
}

class Parser {
  constructor(
    private s: string,
    public i: number,
  ) {}

  private ws() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === " " || c === "\n" || c === "\t" || c === "\r") this.i++;
      else if (c === "/" && this.s[this.i + 1] === "*") {
        const e = this.s.indexOf("*/", this.i + 2);
        this.i = e < 0 ? this.s.length : e + 2;
      } else break;
    }
  }

  value(): Literal {
    this.ws();
    const from = this.i;
    const v = this.primary();
    return this.postfix(v, from);
  }

  /**
   * Après une valeur, la suite éventuelle : `"a,b".split(",")` (forme compacte des listes de sources du guide) donne
   * le tableau ; toute autre suite (`.map(…)`, `?? x`, `+ y`…) fait de l'ensemble une expression non évaluée.
   */
  private postfix(v: Literal, from: number): Literal {
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === undefined || c === "," || c === "}" || c === "]" || c === ")" || c === ";" || c === ":") return v;
      const split = /^\.split\(\s*(["'`])/.exec(this.s.slice(this.i, this.i + 12));
      if (typeof v === "string" && split) {
        const save = this.i;
        this.i += split[0].length - 1;
        const sep = split[1] === "`" ? this.template() : this.quoted(split[1]);
        this.ws();
        if (this.s[this.i] === ")") {
          this.i++;
          v = v.split(sep);
          continue;
        }
        this.i = save;
      }
      this.i = from;
      return { $ref: this.skipExpression() };
    }
  }

  private primary(): Literal {
    const c = this.s[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === '"' || c === "'") return this.quoted(c);
    if (c === "`") {
      const t = this.template();
      // un gabarit avec ${…} dépend du code : on garde le texte, les expressions restent telles quelles
      return t;
    }
    if (c === "!" && (this.s[this.i + 1] === "0" || this.s[this.i + 1] === "1") && !IDENT.test(this.s[this.i + 2] ?? "")) {
      this.i += 2;
      return this.s[this.i - 1] === "0";
    }
    if (c === "-" || (c >= "0" && c <= "9") || (c === "." && /\d/.test(this.s[this.i + 1] ?? ""))) {
      const m = /^-?(?:0x[\da-f]+|\d*\.?\d+(?:e[+-]?\d+)?)/i.exec(this.s.slice(this.i, this.i + 40));
      if (m && !IDENT.test(this.s[this.i + m[0].length] ?? "")) {
        this.i += m[0].length;
        return Number(m[0]);
      }
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null], ["void 0", undefined]] as const) {
      if (this.s.startsWith(word, this.i) && !IDENT.test(this.s[this.i + word.length] ?? "")) {
        this.i += word.length;
        return v;
      }
    }
    return { $ref: this.skipExpression() };
  }

  private object(): Record<string, Literal> {
    const out: Record<string, Literal> = {};
    this.i++; // {
    for (;;) {
      this.ws();
      if (this.s[this.i] === "}") {
        this.i++;
        return out;
      }
      if (this.s.startsWith("...", this.i)) {
        this.i += 3;
        this.skipExpression();
      } else {
        const key = this.key();
        this.ws();
        if (this.s[this.i] === ":") {
          this.i++;
          out[key] = this.value();
        } else if (this.s[this.i] === "(") {
          // méthode : name(){…}
          this.skipExpression();
          out[key] = { $ref: key };
        } else {
          out[key] = { $ref: key }; // raccourci { a }
        }
      }
      this.ws();
      if (this.s[this.i] === ",") this.i++;
      else if (this.s[this.i] !== "}") throw new LiteralError(`« , » ou « } » attendu à ${this.i}`);
    }
  }

  private key(): string {
    const c = this.s[this.i];
    if (c === '"' || c === "'") return this.quoted(c);
    if (c === "`") return this.template();
    if (c === "[") {
      // clé calculée : [expr]
      return `[${this.skipExpression()}]`;
    }
    const m = /^[\w$]+/.exec(this.s.slice(this.i, this.i + 200));
    if (!m) throw new LiteralError(`clé attendue à ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }

  private array(): Literal[] {
    const out: Literal[] = [];
    this.i++; // [
    for (;;) {
      this.ws();
      if (this.s[this.i] === "]") {
        this.i++;
        return out;
      }
      if (this.s[this.i] === ",") {
        out.push(undefined); // trou
        this.i++;
        continue;
      }
      if (this.s.startsWith("...", this.i)) {
        this.i += 3;
        this.skipExpression();
      } else out.push(this.value());
      this.ws();
      if (this.s[this.i] === ",") this.i++;
      else if (this.s[this.i] !== "]") throw new LiteralError(`« , » ou « ] » attendu à ${this.i}`);
    }
  }

  private quoted(q: string): string {
    let out = "";
    this.i++;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === q) {
        this.i++;
        return out;
      }
      if (c === "\\") {
        out += this.escape();
        continue;
      }
      if (c === "\n") throw new LiteralError(`texte non fermé à ${this.i}`);
      out += c;
      this.i++;
    }
    throw new LiteralError("texte non fermé");
  }

  private template(): string {
    let out = "";
    this.i++;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === "`") {
        this.i++;
        return out;
      }
      if (c === "\\") {
        out += this.escape();
        continue;
      }
      if (c === "$" && this.s[this.i + 1] === "{") {
        const from = this.i;
        this.i += 2;
        this.skipBalanced("}");
        out += this.s.slice(from, this.i);
        continue;
      }
      out += c;
      this.i++;
    }
    throw new LiteralError("gabarit non fermé");
  }

  private escape(): string {
    const n = this.s[this.i + 1];
    this.i += 2;
    switch (n) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      case "\n":
        return "";
      case "x": {
        const h = this.s.slice(this.i, this.i + 2);
        this.i += 2;
        return String.fromCharCode(parseInt(h, 16));
      }
      case "u": {
        if (this.s[this.i] === "{") {
          const e = this.s.indexOf("}", this.i);
          const cp = parseInt(this.s.slice(this.i + 1, e), 16);
          this.i = e + 1;
          return String.fromCodePoint(cp);
        }
        const h = this.s.slice(this.i, this.i + 4);
        this.i += 4;
        return String.fromCharCode(parseInt(h, 16));
      }
      default:
        return n ?? "";
    }
  }

  /** Passe une expression quelconque jusqu'à la virgule ou au crochet fermant de même niveau ; renvoie son texte. */
  private skipExpression(): string {
    const from = this.i;
    let depth = 0;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '"' || c === "'") {
        this.quoted(c);
        continue;
      }
      if (c === "`") {
        this.template();
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if ((c === "," || c === ";") && depth === 0) break;
      this.i++;
    }
    const text = this.s.slice(from, this.i).trim();
    if (!text) throw new LiteralError(`valeur attendue à ${from}`);
    return text;
  }

  /** Avance jusqu'au `close` qui équilibre (en sautant textes et gabarits) */
  private skipBalanced(close: string) {
    let depth = 0;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '"' || c === "'") {
        this.quoted(c);
        continue;
      }
      if (c === "`") {
        this.template();
        continue;
      }
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") {
        if (depth === 0 && c === close) {
          this.i++;
          return;
        }
        depth--;
      }
      this.i++;
    }
    throw new LiteralError("expression non fermée");
  }
}
