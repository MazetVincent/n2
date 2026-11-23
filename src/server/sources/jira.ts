import type { Config } from "../config.ts";
import { run, CommandError, SourceFailure } from "../run.ts";
import type { JiraIssue, JiraSprintData } from "../types.ts";
import { msg } from "../messages.ts";

export async function acli(args: string[]): Promise<string> {
  try {
    return await run("acli", ["jira", ...args]);
  } catch (e) {
    if (e instanceof CommandError && /unauthori|not authenticated|auth login|401/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_jira_not_logged_in"), hint: msg("srv_hint_jira_login") });
    }
    throw e;
  }
}

interface RawIssue {
  key: string;
  fields: {
    summary: string;
    issuetype?: { name: string };
    priority?: { name: string };
    status: { name: string; statusCategory: { key: JiraIssue["category"] } };
    assignee?: { displayName: string } | null;
  };
}

export async function fetchSprint(cfg: Config): Promise<JiraSprintData> {
  const { site, boardId, projectKey, onlyMine } = cfg.jira;
  const sprints = JSON.parse(await acli(["board", "list-sprints", "--id", String(boardId), "--state", "active", "--json"]));
  const active = sprints.sprints?.[0];
  if (!active) return { sprint: null, issues: [] };

  const jql = `sprint = ${Number(active.id)}${onlyMine ? " AND assignee = currentUser()" : ""} ORDER BY status, priority DESC`;
  const raw = JSON.parse(
    await acli(["workitem", "search", "--jql", jql, "--fields", "key,summary,status,priority,issuetype,assignee", "--limit", "200", "--json"]),
  ) as RawIssue[];

  return {
    sprint: {
      name: active.name,
      goal: active.goal ?? "",
      startDate: active.startDate,
      endDate: active.endDate,
      url: `https://${site}/jira/software/c/projects/${projectKey}/boards/${boardId}`,
    },
    issues: raw.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      url: `https://${site}/browse/${i.key}`,
      type: i.fields.issuetype?.name ?? "",
      priority: i.fields.priority?.name ?? "",
      status: i.fields.status.name,
      category: i.fields.status.statusCategory.key,
      assignee: i.fields.assignee?.displayName ?? null,
    })),
  };
}
