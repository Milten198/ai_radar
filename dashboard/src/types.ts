// Mirrors BriefContent in pipeline/src/steps/brief.ts.
export interface ArticleLink {
  id: number;
  title: string;
  url: string;
  source: string;
}

export interface BriefContent {
  tldr: Array<{ text: string; articles: ArticleLink[] }>;
  trends: Array<{ topic: string; why: string; articles: ArticleLink[] }>;
  reading: Array<{ rank: number; title: string; summary: string; why_for_me: string; articles: ArticleLink[] }>;
  learning: Array<{ skill: string; why: string; articles: ArticleLink[] }>;
}

export interface Brief {
  brief_date: string;
  content: BriefContent;
  article_ids: number[];
  created_at: string;
}

export interface Run {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "failed";
  error: string | null;
}
