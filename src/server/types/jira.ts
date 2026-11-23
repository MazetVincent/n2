// Jira : sprint actif et tickets.


// ---------- Jira ----------
export interface JiraIssue {
  key: string;
  summary: string;
  url: string;
  type: string;
  priority: string;
  status: string;
  category: "new" | "indeterminate" | "done";
  assignee: string | null;
}

export interface JiraSprintData {
  sprint: { name: string; goal: string; startDate: string; endDate: string; url: string } | null;
  issues: JiraIssue[];
}
