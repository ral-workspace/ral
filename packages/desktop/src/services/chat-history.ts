import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";

const RAL_DIR = ".ral";
const PROJECTS_DIR = "projects";

export interface SessionRecord {
  type: "session_meta" | "chat_message";
  sessionId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface SessionSummary {
  sessionId: string;
  createdAt: string;
  preview: string;
  agentSessionId?: string;
}

function encodeProjectPath(path: string): string {
  return path.replace(/\//g, "-");
}

async function getSessionDir(projectPath: string): Promise<string> {
  const home = await homeDir();
  const encoded = encodeProjectPath(projectPath);
  return await join(home, RAL_DIR, PROJECTS_DIR, encoded);
}

export async function appendToSession(
  projectPath: string,
  sessionId: string,
  record: SessionRecord,
): Promise<void> {
  const dir = await getSessionDir(projectPath);
  const filePath = await join(dir, `${sessionId}.jsonl`);
  const line = JSON.stringify(record) + "\n";
  await invoke("append_file", { path: filePath, content: line });
}

export async function loadSession(
  projectPath: string,
  sessionId: string,
): Promise<SessionRecord[]> {
  const dir = await getSessionDir(projectPath);
  const filePath = await join(dir, `${sessionId}.jsonl`);
  try {
    const content = await invoke<string>("read_file", { path: filePath });
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionRecord);
  } catch {
    return [];
  }
}

export async function listSessions(
  projectPath: string,
): Promise<SessionSummary[]> {
  const dir = await getSessionDir(projectPath);
  try {
    const entries = await invoke<{ name: string; path: string; is_directory: boolean }[]>(
      "read_dir",
      { path: dir },
    );

    const sessions: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.name.endsWith(".jsonl")) continue;
      const sessionId = entry.name.replace(".jsonl", "");
      try {
        const content = await invoke<string>("read_file", { path: entry.path });
        const firstLine = content.split("\n")[0];
        if (!firstLine) continue;
        const meta = JSON.parse(firstLine) as SessionRecord;
        // Scan all lines for preview and agentSessionId
        const lines = content.trim().split("\n");
        let preview = "";
        let agentSessionId: string | undefined;
        for (const line of lines) {
          const rec = JSON.parse(line) as SessionRecord;
          if (rec.type === "chat_message" && !preview) {
            const msg = rec.message as { role: string; parts: { type: string; text?: string }[] } | undefined;
            if (msg?.role === "user") {
              const textPart = msg.parts.find((p) => p.type === "text");
              preview = textPart?.text?.slice(0, 100) ?? "";
            }
          }
          if (rec.type === "session_meta" && rec.agentSessionId) {
            agentSessionId = rec.agentSessionId as string;
          }
        }
        sessions.push({
          sessionId,
          createdAt: meta.timestamp ?? meta.createdAt as string ?? "",
          preview,
          agentSessionId,
        });
      } catch {
        // skip corrupted files
      }
    }

    // Sort by createdAt descending (newest first)
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sessions;
  } catch {
    return [];
  }
}
