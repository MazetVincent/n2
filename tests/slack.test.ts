// Slack : texte des messages, liens, regroupement des messages directs, et lecture complète avec une fausse API.
// Données inventées.
import { describe, expect, it } from "vitest";
import { fetchSlack, groupDms, isShown, mpimName, permalink, slackText } from "../src/server/sources/slack.ts";
import { makeConfig } from "./helpers.ts";

describe("slackText : syntaxe Slack → texte lisible", () => {
  const names = new Map([["U1", "Camille"]]);

  it("remplace mentions, salons, groupes et @here", () => {
    expect(slackText("<@U1> regarde <#C9|dev-front> <!here> <!subteam^S1|@front>", names)).toBe("@Camille regarde #dev-front @here @front");
  });

  it("garde le libellé d'une mention inconnue, sinon son identifiant", () => {
    expect(slackText("<@U2|alex> et <@U3>", names)).toBe("@alex et @U3");
  });

  it("remplace les liens par leur texte et décode les entités", () => {
    expect(slackText("voir <https://example.com/a|la PR> &amp; <https://example.com/b> &lt;ok&gt;", names)).toBe("voir la PR & https://example.com/b <ok>");
  });

  it("affiche les dates Slack avec leur texte de secours", () => {
    expect(slackText("livré <!date^1700000000^{date_short}|le 14 nov.>", names)).toBe("livré le 14 nov.");
  });
});

describe("liens et noms", () => {
  it("permalink : message, et réponse dans un fil", () => {
    expect(permalink("https://demo.slack.com/", "C1", "1700000000.123456")).toBe("https://demo.slack.com/archives/C1/p1700000000123456");
    expect(permalink("https://demo.slack.com", "C1", "1700000001.000200", "1700000000.123456")).toBe(
      "https://demo.slack.com/archives/C1/p1700000001000200?thread_ts=1700000000.123456&cid=C1",
    );
  });

  it("mpimName : les autres participants d'un groupe", () => {
    expect(mpimName("mpdm-alice--bob--moi-1", "moi")).toBe("alice, bob");
  });

  it("isShown : masque arrivées, départs et changements de sujet", () => {
    expect(isShown({ ts: "1" })).toBe(true);
    expect(isShown({ ts: "1", subtype: "bot_message" })).toBe(true);
    expect(isShown({ ts: "1", subtype: "channel_join" })).toBe(false);
  });

  it("groupDms : une ligne par conversation directe, la plus récente, sans mes propres messages", () => {
    const m = (id: string, ts: string, user: string, is_im = true) => ({ ts, user, text: ts, permalink: "", channel: { id, name: id, is_im } });
    const out = groupDms([m("D1", "3", "U1"), m("D1", "2", "U1"), m("C1", "2", "U2", false), m("D2", "1", "ME"), m("D3", "1", "U3")], "ME");
    expect(out.map((x) => `${x.channel.id}:${x.ts}`)).toEqual(["D1:3", "D3:1"]);
  });
});

describe("fetchSlack : lecture complète (fausse API)", () => {
  const now = new Date(2026, 10, 21, 12);
  const calls: string[] = [];
  const fake = async <T,>(method: string, params: Record<string, string> = {}): Promise<T> => {
    calls.push(`${method} ${params.query ?? params.channel ?? params.user ?? ""}`.trim());
    const r = (v: unknown) => v as T;
    switch (method) {
      case "auth.test":
        return r({ url: "https://demo.slack.com/", team: "Démo", user: "moi", user_id: "UME" });
      case "search.messages":
        if (params.query.startsWith("<@UME>")) {
          return r({
            messages: {
              matches: [
                { ts: "1763700000.000100", user: "U1", text: "<@UME> tu peux relire ?", permalink: "https://demo.slack.com/archives/C1/p1", channel: { id: "C1", name: "dev-front" } },
                { ts: "1763700000.000050", user: "UME", text: "je me cite <@UME>", permalink: "x", channel: { id: "C1", name: "dev-front" } },
              ],
            },
          });
        }
        return r({
          messages: {
            matches: [
              { ts: "1763600000.000100", user: "U2", text: "Tu as 5 min ?", permalink: "https://demo.slack.com/archives/D1/p2", channel: { id: "D1", name: "U2", is_im: true } },
              { ts: "1763500000.000100", user: "U1", text: "On déjeune ?", permalink: "https://demo.slack.com/archives/G1/p3", channel: { id: "G1", name: "mpdm-camille--alex--moi-1", is_mpim: true } },
            ],
          },
        });
      case "conversations.list":
        return r({ channels: [{ id: "C1", name: "dev-front" }, { id: "C2", name: "releases" }] });
      case "conversations.history":
        return r({
          messages: [
            { ts: "1763700500.000100", user: "U1", text: "Release 2.4 en prod 🚀", reply_count: 2 },
            { ts: "1763700400.000100", user: "U3", subtype: "channel_join", text: "a rejoint" },
            { ts: "1763700300.000100", user: "UME", text: "merci" },
            { ts: "1763600000.000100", user: "U2", text: "ancien message" },
          ],
        });
      case "conversations.info":
        if (params.channel === "D1") return r({ channel: { user: "U2", unread_count_display: 3 } });
        if (params.channel === "G1") return r({ channel: { name: "mpdm-camille--alex--moi-1", unread_count_display: 0, is_mpim: true } });
        return r({ channel: { is_member: true, last_read: "1763650000.000000" } });
      case "users.info":
        return r({ user: { name: params.user.toLowerCase(), profile: { display_name: { U1: "Camille", U2: "Alex", U3: "Sam", UME: "moi" }[params.user] ?? "" } } });
    }
    throw new Error(`méthode inattendue : ${method}`);
  };

  it("assemble mentions, messages directs et salons", async () => {
    const cfg = { ...makeConfig("/tmp"), slack: { channels: ["#releases", "inconnu"], messages: 3 } };
    const d = await fetchSlack(cfg, now, fake);

    expect(d.team).toBe("Démo");
    // mentions : pas mes propres messages, auteur et texte lisibles
    expect(d.mentions).toHaveLength(1);
    expect(d.mentions[0]).toMatchObject({ author: "Camille", channel: "#dev-front", text: "@moi tu peux relire ?", url: "https://demo.slack.com/archives/C1/p1" });

    // messages directs : nom de la personne ou des participants, non-lus donnés par Slack
    expect(d.dms.map((c) => [c.name, c.unread, c.last.unread])).toEqual([
      ["Alex", 3, true],
      ["camille, alex", 0, false],
    ]);

    // salons : messages techniques masqués, non-lus après mon curseur de lecture, sauf les miens
    expect(d.missing).toEqual(["inconnu"]);
    const rel = d.channels[0];
    expect(rel).toMatchObject({ id: "C2", name: "releases", url: "https://demo.slack.com/archives/C2", unread: 1 });
    expect(rel.messages.map((m) => [m.author, m.text, m.unread, m.mine, m.replies])).toEqual([
      ["Camille", "Release 2.4 en prod 🚀", true, false, 2],
      ["moi", "merci", false, true, 0],
      ["Alex", "ancien message", false, false, 0],
    ]);
    expect(rel.messages[0].url).toBe("https://demo.slack.com/archives/C2/p1763700500000100");
  });

  it("cherche sur les 7 derniers jours", () => {
    expect(calls).toContain("search.messages <@UME> after:2026-11-14");
    expect(calls).toContain("search.messages to:me after:2026-11-14");
  });

  it("demande une config Slack", async () => {
    await expect(fetchSlack(makeConfig("/tmp"), now, fake)).rejects.toMatchObject({ detail: { message: { key: "srv_slack_not_configured" } } });
  });
});
