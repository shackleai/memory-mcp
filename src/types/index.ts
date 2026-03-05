export interface Config {
  storage_path: string;
  embedding: {
    provider: "local" | "openai";
    api_key?: string;
  };
  max_memories_per_project: number;
  max_session_history_days: number;
  auto_init: boolean;
  auto_dedup: boolean;
  dedup_threshold: number;
}

export interface Memory {
  id: string;
  project_id: string;
  content: string;
  category: MemoryCategory;
  importance: Importance;
  tags: string[];
  source: string | null;
  session_date: string | null;
  session_id: string | null;
  status: TodoStatus | null;
  hit_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export interface MemoryWithScore extends Memory {
  score: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  tech_stack: string | null;
  summary: string | null;
  conventions: string | null;
  created_at: string;
  last_session_at: string | null;
}

export interface Session {
  id: string;
  project_id: string;
  date: string;
  summary: string | null;
  open_items: string | null;
  memory_count: number;
  created_at: string;
}

export type MemoryCategory =
  | "decision"
  | "convention"
  | "bug"
  | "architecture"
  | "preference"
  | "todo"
  | "context"
  | "session_summary";

export type Importance = "low" | "medium" | "high";

export type TodoStatus = "pending" | "in_progress" | "done";
