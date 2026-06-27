export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
  tags: string[];
}

export interface TagEntry {
  tag: string;
  count: number;
}

export interface DiskInfo {
  total: number;
  used: number;
  available: number;
}

export interface CronJob {
  id: string;
  schedule: string;
  src: string;
  dst: string;
  mode: string;
  label: string;
}

export interface RsyncEvent {
  line: string;
  is_error: boolean;
  done: boolean;
  exit_ok: boolean;
}

export interface SshProfile {
  id: string;
  name: string;
  user: string;
  host: string;
  port: number;
  key_path: string;
}

export type RsyncMode = "mirror" | "sync" | "incremental" | "dry-run";

export type Page = "sync" | "schedule" | "connections" | "tags" | "duplicates" | "timeshift" | "history";

export interface DuplicateGroup {
  size: number;
  hash: string;
  files: string[];
}

export interface DupEvent {
  phase: "scanning" | "hashing" | "done" | "error";
  current: number;
  total: number;
  groups: DuplicateGroup[];
  message: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  src: string;
  dst: string;
  mode: string;
  success: boolean;
  duration_secs: number;
}

export interface TimeshiftSnapshot {
  name: string;
  tags: string;
  comment: string;
}

export interface TimeshiftEvent {
  line: string;
  is_error: boolean;
  done: boolean;
  exit_ok: boolean;
}

export interface PaneState {
  path: string;
  mode: "local" | "ssh";
  profileId: string | null;
}
