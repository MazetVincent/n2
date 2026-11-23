// Statistiques de la semaine : semaines, heures ouvrées, médianes, regroupement des PR, Sentry, graduations.
import { describe, expect, it } from "vitest";
import { change, cycleTime, dayKey, formatDuration, lastWeeks, median, prWeeks, reviewDelay, slowestPrs, weekStart, weeklyCounts, workingMs, type StatsPr } from "../src/features/stats/logic.ts";
import { niceMax } from "../src/features/stats/WeekChart.tsx";
import { toStatsPr } from "../src/server/sources/stats.ts";

const H = 3_600_000;
// dates locales (les semaines commencent le lundi à minuit, heure locale)
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
const iso = (y: number, m: number, d: number, h = 0) => new Date(at(y, m, d, h)).toISOString();

describe("semaines", () => {
  it("commencent le lundi à minuit", () => {
    expect(dayKey(weekStart(at(2026, 11, 22, 23)))).toBe("2026-11-16"); // dimanche soir
    expect(dayKey(weekStart(at(2026, 11, 16, 0)))).toBe("2026-11-16"); // lundi minuit
    expect(dayKey(weekStart(at(2026, 11, 15, 12)))).toBe("2026-11-09");
  });

  it("donne les 8 dernières, de la plus ancienne à la semaine en cours", () => {
    const weeks = lastWeeks(at(2026, 11, 19), 8).map(dayKey);
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toBe("2026-09-28");
    expect(weeks[7]).toBe("2026-11-16");
  });
});

describe("heures ouvrées", () => {
  it("ne comptent ni le samedi ni le dimanche", () => {
    expect(workingMs(at(2026, 11, 20, 18), at(2026, 11, 23, 9))).toBe(15 * H); // vendredi 18 h → lundi 9 h
    expect(workingMs(at(2026, 11, 21, 10), at(2026, 11, 22, 10))).toBe(0); // samedi → dimanche
    expect(workingMs(at(2026, 11, 17, 9), at(2026, 11, 17, 11))).toBe(2 * H);
  });

  it("restent justes au changement d'heure", () => {
    // nuit du samedi 24 au dimanche 25 octobre 2026 : week-end, rien n'est compté ; le lundi compte 9 h
    expect(workingMs(at(2026, 10, 23, 23), at(2026, 10, 26, 9))).toBe(10 * H);
  });

  it("valent zéro pour un intervalle vide ou inversé", () => {
    expect(workingMs(at(2026, 11, 18), at(2026, 11, 17))).toBe(0);
  });
});

describe("médiane et évolution", () => {
  it("médiane", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("évolution en % par rapport à la semaine précédente", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(50, 100)).toBe(-50);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

const pr = (n: number, extra: Partial<StatsPr>): StatsPr => ({
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/o/r/pull/${n}`,
  author: "ann",
  bot: false,
  createdAt: iso(2026, 11, 16, 9),
  readyAt: iso(2026, 11, 16, 9),
  firstReviewAt: null,
  mergedAt: null,
  ...extra,
});

describe("PR par semaine", () => {
  const weeks = lastWeeks(at(2026, 11, 19), 2); // semaines du 9 et du 16 novembre
  const prs = [
    pr(1, { firstReviewAt: iso(2026, 11, 16, 11), mergedAt: iso(2026, 11, 17, 9) }), // revue 2 h, fusion 24 h
    pr(2, { readyAt: iso(2026, 11, 12, 9), firstReviewAt: iso(2026, 11, 12, 13), mergedAt: iso(2026, 11, 16, 9) }), // jeudi → lundi : 2 j ouvrés
    pr(3, { createdAt: iso(2026, 11, 10, 9), readyAt: iso(2026, 11, 17, 9), firstReviewAt: iso(2026, 11, 13, 9) }), // revue pendant le brouillon
    pr(4, { bot: true, author: "renovate", firstReviewAt: iso(2026, 11, 16, 10), mergedAt: iso(2026, 11, 16, 12) }),
  ];

  it("fusion comptée dans la semaine de la fusion, revue dans celle de la première revue, sans les robots", () => {
    const [prev, cur] = prWeeks(prs, weeks);
    expect(prev).toEqual({ merged: 0, cycle: null, reviewed: 1, review: 4 * H });
    expect(cur).toEqual({ merged: 2, cycle: (24 * H + 48 * H) / 2, reviewed: 1, review: 2 * H });
  });

  it("une revue faite pendant le brouillon n'a pas de délai", () => {
    expect(reviewDelay(prs[2])).toBeNull();
    expect(cycleTime(prs[2])).toBeNull();
  });

  it("liste les plus longues à fusionner des deux dernières semaines, sans les robots", () => {
    expect(slowestPrs(prs, weeks).map((p) => [p.number, p.cycle])).toEqual([
      [2, 48 * H],
      [1, 24 * H],
    ]);
  });
});

describe("lecture GitHub", () => {
  const raw = (author: string, typename: string, reviews: { login: string; typename?: string; at: string | null; state?: string }[], ready?: string) => ({
    number: 9,
    title: "t",
    url: "u",
    createdAt: iso(2026, 11, 16, 9),
    mergedAt: null,
    headRefName: "feat/x",
    author: { __typename: typename, login: author },
    timelineItems: { nodes: ready ? [{ createdAt: ready }] : [] },
    reviews: { nodes: reviews.map((r) => ({ author: { __typename: r.typename ?? "User", login: r.login }, submittedAt: r.at, state: r.state ?? "COMMENTED" })) },
  });

  it("première revue : ni l'auteur, ni un robot, ni une revue en attente", () => {
    const p = toStatsPr(raw("ann", "User", [
      { login: "ann", at: iso(2026, 11, 16, 10) },
      { login: "sonar", typename: "Bot", at: iso(2026, 11, 16, 10) },
      { login: "bob", at: null, state: "PENDING" },
      { login: "bob", at: iso(2026, 11, 16, 15), state: "APPROVED" },
    ]));
    expect(p.firstReviewAt).toBe(iso(2026, 11, 16, 15));
    expect(p.readyAt).toBe(p.createdAt);
    expect(p.bot).toBe(false);
  });

  it("prend le passage en « prête pour revue » et reconnaît les PR de robots", () => {
    expect(toStatsPr(raw("ann", "User", [], iso(2026, 11, 18, 9))).readyAt).toBe(iso(2026, 11, 18, 9));
    expect(toStatsPr(raw("renovate", "Bot", [])).bot).toBe(true);
  });
});

describe("Sentry et affichage", () => {
  it("regroupe les événements par jour en semaines", () => {
    const weeks = lastWeeks(at(2026, 11, 19), 2);
    const s = (y: number, m: number, d: number) => Math.floor(at(y, m, d, 12) / 1000);
    expect(weeklyCounts([[s(2026, 11, 10), 5], [s(2026, 11, 15), 2], [s(2026, 11, 16), 7], [s(2026, 11, 1), 99]], weeks)).toEqual([7, 7]);
  });

  it("écrit les durées lisiblement", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(25 * 60_000)).toBe("25 min");
    expect(formatDuration(6 * H)).toBe("6 h");
    expect(formatDuration(36 * H)).toBe("1,5 j");
    expect(formatDuration(36 * H, "en")).toBe("1.5 d");
  });

  it("choisit une graduation ronde au-dessus du maximum", () => {
    expect(niceMax(25_996, "count")).toBe(30_000);
    expect(niceMax(32, "count")).toBe(40);
    expect(niceMax(0, "count")).toBe(1);
    expect(niceMax(3.6 * 24 * H, "duration")).toBe(96 * H);
    expect(niceMax(20 * 60_000, "duration")).toBe(H);
  });
});
