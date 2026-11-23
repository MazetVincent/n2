// GitHub : pull requests, et PR de mise à jour des librairies (Renovate, Dependabot…).
import type { m } from "../../paraglide/messages.js";

// ---------- GitHub ----------
export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  ci: CiState;
  updatedAt: string;
  myReview: ReviewState | null;
  jira: { key: string; url: string }[];
  /** branche de la PR (headRefName) */
  branch: string;
}

export interface PullRequestsData {
  me: string;
  mine: PullRequest[];
  approved: PullRequest[];
  commented: PullRequest[];
  /** PR ouvertes où une revue m'est demandée */
  reviewRequested: PullRequest[];
  searchUrl: string;
}

// ---------- PR de mise à jour des librairies ----------
/** Une librairie dont une PR annonce la mise à jour (lue dans la description de la PR) */
export interface PrBodyUpdate {
  name: string;
  from: string | null;
  to: string | null;
}

/** PR ouverte d'un dépôt suivi, réduite à ce qui sert à la relier aux librairies */
export interface OpenPr {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  /** branche de la PR (renovate/…, dependabot/…, feat/…) */
  branch: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: PullRequest["reviewDecision"];
  mergeable: PullRequest["mergeable"];
  ci: CiState;
  /** librairies listées dans la description (tableau Renovate, « Bumps … from … to … » de Dependabot) */
  updates: PrBodyUpdate[];
}
