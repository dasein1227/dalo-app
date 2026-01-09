import { AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';

import {
  computeServerOffsetMs,
  loadServerOffsetMeta,
  nowWithOffsetMs,
  saveServerOffsetMs,
} from './serverTimeOffset';
import { extractLocalFilePathsFromMessagePayload, purgeLocalFiles } from './filePurge';

/**
 * Unified Delete Engine (production-grade)
 * - Enforces delete_at using (deviceNow + serverOffset)
 * - Foreground: emits events so UI can do 300ms dissolve before hard-delete
 * - Background: best-effort sweep via BackgroundFetch (if available), plus "return-to-foreground sweep"
 * - Lazy Cleanup: runs on app resume, network regain, and periodic foreground tick
 *
 * IMPORTANT:
 * - This module does NOT change any existing chat behavior by itself.
 * - It only cleans up messages whose delete_at is already set and due.
 */

export type DeleteEngineOptions = {
  supabaseUrl: string;

  /**
   * Refresh server offset no more frequently than this interval (ms).
   * Recommended: 10–30 min.
   */
  offsetRefreshIntervalMs?: number;

  /**
   * Foreground sweep cadence (ms).
   * Recommended: 3–10 sec depending on list size.
   */
  foregroundSweepIntervalMs?: number;

  /**
   * When we emit "due delete" to UI, if UI doesn't respond (no animation callback),
   * we will hard-delete after this timeout (ms) as a failsafe.
   */
  uiAckTimeoutMs?: number;
};

type EngineState = {
  started: boolean;
  offsetMs: number;
  offsetUpdatedAtMs: number;
  lastOffsetSyncAtMs: number;
  appState: 'active' | 'background' | 'inactive' | 'unknown';
  fgTimer: any;
  pendingUiTimeouts: Map<string, any>;
};

const STATE: EngineState = {
  started: false,
  offsetMs: 0,
  offsetUpdatedAtMs: 0,
  lastOffsetSyncAtMs: 0,
  appState: 'unknown',
  fgTimer: null,
  pendingUiTimeouts: new Map(),
};

const BG_TASK_NAME = 'chat:lazy_cleanup:v1';
const KEY_ENGINE_STARTED = 'chat:delete_engine_started:v1';

export const DELETE_DUE_EVENT = 'chat:message_due_delete';

/**
 * Returns (deviceNow + serverOffset).
 * Offset is cached and refreshed by the engine.
 */
export async function getNowMs(): Promise<number> {
  if (!STATE.offsetUpdatedAtMs) {
    const meta = await loadServerOffsetMeta();
    STATE.offsetMs = meta.offsetMs;
    STATE.offsetUpdatedAtMs = meta.updatedAtMs;
  }
  return nowWithOffsetMs(STATE.offsetMs);
}

async function syncOffsetIfNeeded(opts: DeleteEngineOptions, force: boolean) {
  const now = Date.now();
  const interval = opts.offsetRefreshIntervalMs ?? 15 * 60 * 1000;

  if (!force && STATE.lastOffsetSyncAtMs && now - STATE.lastOffsetSyncAtMs < interval) return;

  const offset = await computeServerOffsetMs(opts.supabaseUrl);
  if (offset == null) return;

  STATE.offsetMs = offset;
  STATE.offsetUpdatedAtMs = now;
  STATE.lastOffsetSyncAtMs = now;
  await saveServerOffsetMs(offset);
}

export function emitDueDelete(messageId: string) {
  try {
    DeviceEventEmitter.emit(DELETE_DUE_EVENT, { messageId });
  } catch {
    // ignore
  }
}

/**
 * Hard-delete a message locally (record + local cached files).
 * Safe to call multiple times (idempotent-ish).
 */
export async function finalizeHardDelete(messageId: string): Promise<void> {
  try {
    await database.write(async () => {
      const msg = await database.get<Message>('messages').find(messageId).catch(() => null);
      if (!msg) return;

      const payload = {
        content: (msg as any).content ?? null,
        original: (msg as any).original ?? null,
        translated_text: (msg as any).translated_text ?? null,
        link_preview: (msg as any).link_preview ?? null,
      };

      const paths = extractLocalFilePathsFromMessagePayload(payload);
      await purgeLocalFiles(paths);

      await msg.destroyPermanently();
    });
  } catch {
    // non-fatal: will be re-attempted by Lazy Cleanup
  }
}

async function hardDeleteMany(ids: string[]): Promise<void> {
  for (const id of ids) {
    await finalizeHardDelete(id);
  }
}

async function queryExpiredMessageIds(nowMs: number): Promise<string[]> {
  // IMPORTANT: WatermelonDB treats null as "missing", so this query only matches numeric delete_at
  const expired = await database
    .get<Message>('messages')
    .query(Q.where('delete_at', Q.lte(nowMs)))
    .fetch();

  return expired.map((m) => String(m.id));
}

function clearForegroundTimer() {
  if (STATE.fgTimer) {
    clearInterval(STATE.fgTimer);
    STATE.fgTimer = null;
  }
}

function armUiAckTimeout(opts: DeleteEngineOptions, messageId: string) {
  const timeoutMs = opts.uiAckTimeoutMs ?? 2500;

  // Avoid duplicating timers per id
  if (STATE.pendingUiTimeouts.has(messageId)) return;

  const t = setTimeout(async () => {
    STATE.pendingUiTimeouts.delete(messageId);
    await finalizeHardDelete(messageId);
  }, timeoutMs);

  STATE.pendingUiTimeouts.set(messageId, t);
}

export function notifyUiDissolveFinished(messageId: string) {
  // Call this from UI after 300ms dissolve animation completes.
  const t = STATE.pendingUiTimeouts.get(messageId);
  if (t) {
    clearTimeout(t);
    STATE.pendingUiTimeouts.delete(messageId);
  }
  // proceed with actual deletion
  void finalizeHardDelete(messageId);
}

async function sweepExpired(opts: DeleteEngineOptions, allowAnimate: boolean) {
  const nowMs = await getNowMs();
  const ids = await queryExpiredMessageIds(nowMs);
  if (!ids.length) return;

  // Foreground + allowAnimate: ask UI to dissolve first
  if (allowAnimate && STATE.appState === 'active') {
    for (const id of ids) {
      emitDueDelete(id);
      armUiAckTimeout(opts, id);
    }
    return;
  }

  // Background or no animation: hard delete immediately
  await hardDeleteMany(ids);
}

async function onForegroundTick(opts: DeleteEngineOptions) {
  await syncOffsetIfNeeded(opts, false);
  await sweepExpired(opts, true);
}

/**
 * Best-effort background integration.
 * We load expo-background-fetch / expo-task-manager dynamically to avoid build-time hard dependency.
 * If not installed, engine still works via:
 * - app resume sweep
 * - periodic foreground sweep
 * - network regain sweep
 */
async function registerBackgroundTaskIfAvailable(opts: DeleteEngineOptions) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TaskManager = require('expo-task-manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BackgroundFetch = require('expo-background-fetch');

    if (TaskManager?.isTaskDefined?.(BG_TASK_NAME)) {
      // already defined
    } else if (TaskManager?.defineTask) {
      TaskManager.defineTask(BG_TASK_NAME, async () => {
        try {
          await syncOffsetIfNeeded(opts, true);
          await sweepExpired(opts, false);
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch {
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });
    }

    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
      minimumInterval: 15 * 60, // seconds (platform may clamp)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // background task not available: ignore
  }
}

export async function startDeleteEngine(opts: DeleteEngineOptions): Promise<void> {
  if (STATE.started) return;
  STATE.started = true;

  // One-time marker (useful for diagnostics)
  try {
    await AsyncStorage.setItem(KEY_ENGINE_STARTED, String(Date.now()));
  } catch {}

  const meta = await loadServerOffsetMeta();
  STATE.offsetMs = meta.offsetMs;
  STATE.offsetUpdatedAtMs = meta.updatedAtMs;
  STATE.lastOffsetSyncAtMs = meta.updatedAtMs;

  STATE.appState = (AppState.currentState as any) || 'unknown';

  await registerBackgroundTaskIfAvailable(opts);

  // Initial sweep
  await syncOffsetIfNeeded(opts, true);
  await sweepExpired(opts, STATE.appState === 'active');

  // AppState transitions: resume => sweep
  AppState.addEventListener('change', async (st) => {
    STATE.appState = (st as any) || 'unknown';

    if (st === 'active') {
      await syncOffsetIfNeeded(opts, true);
      await sweepExpired(opts, true);

      if (!STATE.fgTimer) {
        STATE.fgTimer = setInterval(
          () => void onForegroundTick(opts),
          opts.foregroundSweepIntervalMs ?? 5000,
        );
      }
    } else {
      clearForegroundTimer();
    }
  });

  // Network regain: refresh offset + sweep
  NetInfo.addEventListener(async (state) => {
    if (state.isConnected) {
      await syncOffsetIfNeeded(opts, true);
      await sweepExpired(opts, STATE.appState === 'active');
    }
  });

  // Foreground periodic sweep
  if (STATE.appState === 'active') {
    STATE.fgTimer = setInterval(
      () => void onForegroundTick(opts),
      opts.foregroundSweepIntervalMs ?? 5000,
    );
  }
}
