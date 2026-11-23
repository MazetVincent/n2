// Activité GitHub et Jira : ce qui attend une réponse dans chaque fil, mentions, robots, format des commentaires.
import { describe, expect, it } from "vitest";
import { adfMentions, adfToText, collectActivity, excerpt, githubThread, jiraThread, mentionsLogin, threadActivity, type RawGithubThread, type RawJiraIssue, type Thread, type ThreadMessage } from "../src/features/activity/logic.ts";
import { activityCandidates } from "../src/features/notify/logic.ts";

const since = Date.parse("2026-11-01T00:00:00Z");
const msg = (authorId: string, at: string, text = "texte", extra: Partial<ThreadMessage> = {}): ThreadMessage => ({ authorId, author: authorId, bot: false, text, at: `2026-11-${at}:00Z`, url: `https://x/${authorId}/${at}`, mentionsMe: false, ...extra });
const thread = (messages: ThreadMessage[], mine = false): Thread => ({ id: "github:https://github.com/o/r/pull/1", source: "github", ref: "#1", title: "Titre", where: "o/r", mine, messages });

describe("ce qui attend une réponse dans un fil", () => {
  it("ma PR : les messages des autres depuis mon dernier message, le dernier affiché", () => {
    const item = threadActivity(thread([msg("bob", "10T10:00"), msg("me", "10T11:00"), msg("bob", "12T09:00", "un"), msg("ann", "12T10:00", "deux")], true), "me", since);
    expect(item).toMatchObject({ kind: "comment", count: 2, author: "ann", excerpt: "deux", at: "2026-11-12T10:00:00Z", url: "https://x/ann/12T10:00" });
  });

  it("rien quand j'ai écrit le dernier message", () => {
    expect(threadActivity(thread([msg("bob", "10T10:00"), msg("me", "11T10:00")], true), "me", since)).toBeNull();
  });

  it("le fil d'un autre : une réponse seulement si j'y avais écrit", () => {
    expect(threadActivity(thread([msg("me", "10T10:00"), msg("bob", "11T10:00")]), "me", since)?.kind).toBe("reply");
    expect(threadActivity(thread([msg("ann", "10T10:00"), msg("bob", "11T10:00")]), "me", since)).toBeNull();
  });

  it("une mention l'emporte et montre le message qui me mentionne", () => {
    const item = threadActivity(thread([msg("bob", "11T10:00", "@me regarde", { mentionsMe: true }), msg("ann", "12T10:00", "autre chose")]), "me", since);
    expect(item).toMatchObject({ kind: "mention", author: "bob", excerpt: "@me regarde", count: 2, at: "2026-11-12T10:00:00Z" });
  });

  it("ignore les robots et ce qui est plus ancien que la fenêtre", () => {
    expect(threadActivity(thread([msg("sonar", "11T10:00", "Quality gate", { bot: true })], true), "me", since)).toBeNull();
    expect(threadActivity(thread([{ ...msg("bob", "11T10:00"), at: "2026-10-20T10:00:00Z" }], true), "me", since)).toBeNull();
  });

  it("classe les fils du plus récent au plus ancien", () => {
    const a = { ...thread([msg("bob", "05T10:00")], true), id: "a" };
    const b = { ...thread([msg("bob", "09T10:00")], true), id: "b" };
    expect(collectActivity([a, b], "me", since).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("GitHub", () => {
  it("reconnaît @login sans confondre une adresse e-mail ou un login plus long", () => {
    expect(mentionsLogin("merci @Me !", "me")).toBe(true);
    expect(mentionsLogin("(@me)", "me")).toBe(true);
    expect(mentionsLogin("ecris à moi@example.test", "me")).toBe(false);
    expect(mentionsLogin("@me-too", "me")).toBe(false);
    expect(mentionsLogin("@meow", "me")).toBe(false);
  });

  it("lit commentaires, revues avec texte et fils de revue ; mon approbation compte comme une réponse", () => {
    const c = (login: string, at: string, body = "ok", typename = "User") => ({ author: { __typename: typename, login }, body, createdAt: `2026-11-${at}:00Z`, url: `https://github.com/o/r/pull/7#${login}-${at}` });
    const raw: RawGithubThread = {
      __typename: "PullRequest",
      number: 7,
      title: "Ajouter le panier",
      url: "https://github.com/o/r/pull/7",
      author: { login: "bob" },
      repository: { nameWithOwner: "o/r" },
      comments: { nodes: [c("me", "10T10:00", "Une question"), c("github-actions", "10T12:00", "Déployé", "Bot")] },
      reviews: { nodes: [{ ...c("ann", "10T11:00", ""), state: "APPROVED" }, { ...c("me", "11T10:00", ""), state: "APPROVED" }] },
      reviewThreads: { nodes: [{ comments: { nodes: [c("bob", "12T10:00", "Réponse dans le fil")] } }] },
    };
    const t = githubThread(raw, "me");
    expect(t.mine).toBe(false);
    expect(t.messages).toHaveLength(4); // l'approbation sans texte d'ann est écartée, la mienne est gardée
    expect(threadActivity(t, "me", since)).toMatchObject({ kind: "reply", author: "bob", ref: "#7", where: "o/r", count: 1 });
  });
});

describe("Jira", () => {
  const body = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "mention", attrs: { id: "acc-me", text: "@Vincent M" } }, { type: "text", text: ", retour :" }] },
      { type: "codeBlock", content: [{ type: "text", text: "secret()" }] },
      { type: "paragraph", content: [{ type: "text", text: "ça marche" }, { type: "hardBreak" }, { type: "inlineCard", attrs: { url: "https://x.y/z" } }] },
    ],
  };

  it("transforme l'ADF en texte et y trouve mes mentions", () => {
    expect(excerpt(adfToText(body))).toBe("Hello @Vincent M, retour : [code] ça marche https://x.y/z");
    expect(adfMentions(body, "acc-me")).toBe(true);
    expect(adfMentions(body, "acc-other")).toBe(false);
  });

  it("construit le fil d'un ticket : lien vers le commentaire, date ISO, ticket à moi", () => {
    const raw: RawJiraIssue = {
      key: "DEMO-1",
      fields: {
        summary: "Panier",
        status: { name: "En revue" },
        assignee: null,
        reporter: { accountId: "acc-me" },
        comment: { comments: [{ id: "99", author: { accountId: "acc-alex", displayName: "Alex" }, body, created: "2026-11-05T16:55:01.782+0100" }] },
      },
    };
    const t = jiraThread(raw, "acc-me", "demo.atlassian.net");
    expect(t.mine).toBe(true);
    expect(t.messages[0]).toMatchObject({ at: "2026-11-05T15:55:01.782Z", url: "https://demo.atlassian.net/browse/DEMO-1?focusedCommentId=99", mentionsMe: true });
    expect(threadActivity(t, "acc-me", since)).toMatchObject({ kind: "mention", author: "Alex", ref: "DEMO-1", where: "En revue" });
  });
});

describe("texte des commentaires", () => {
  it("retire commentaires HTML, citations, images et liens markdown, puis raccourcit", () => {
    expect(excerpt("<!-- modèle -->\n> ta question\nVoir [la doc](https://x) ![capture](https://y.png)  ok")).toBe("Voir la doc [image] ok");
    expect(excerpt("a".repeat(400))).toHaveLength(280);
  });
});

describe("notifications GitHub et Jira", () => {
  it("un nouveau message dans le même fil notifie de nouveau", () => {
    const item = threadActivity(thread([msg("bob", "11T10:00", "@me", { mentionsMe: true })]), "me", since)!;
    const later = { ...item, at: "2026-11-12T10:00:00Z" };
    const [a] = activityCandidates({ items: [item], days: 14, failed: [] });
    const [b] = activityCandidates({ items: [later], days: 14, failed: [] });
    expect(a.title).toBe("bob t'a mentionné");
    expect(a.url).toBe(item.url);
    expect(a.key).not.toBe(b.key);
  });
});
