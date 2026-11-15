import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "./api";
import type { Session } from "./session";

const KEY = "if7-task-outbox";

export type QueuedTaskUpdate = {
  taskId: string;
  title: string;
  body: Record<string, unknown>;
  capturedAt: string;
};

async function read(): Promise<QueuedTaskUpdate[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as QueuedTaskUpdate[];
  } catch {
    return [];
  }
}

async function write(items: QueuedTaskUpdate[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function queuedTaskUpdates() {
  return read();
}

export async function queueTaskUpdate(item: QueuedTaskUpdate) {
  const items = await read();
  await write([...items.filter((row) => row.taskId !== item.taskId), item]);
}

export async function flushTaskUpdates(session: Session) {
  const items = await read();
  const left: QueuedTaskUpdate[] = [];
  for (const item of items) {
    try {
      if (item.body.status === "done") {
        await api(`/tasks/${item.taskId}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token).catch(() => undefined);
      }
      await api(`/tasks/${item.taskId}`, { method: "POST", body: JSON.stringify(item.body) }, session.token, 20_000);
    } catch (err) {
      if (err instanceof ApiError && err.offline) left.push(item);
    }
  }
  await write(left);
  return { sent: items.length - left.length, waiting: left.length };
}
