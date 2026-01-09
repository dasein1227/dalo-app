import { Q } from '@nozbe/watermelondb';
import { database } from '@/lib/chatDB/database';
import AppSetting from '@/lib/chatDB/models/AppSetting';

const TABLE = 'app_settings';
const SINGLETON_ID = 'singleton';

// 안전 범위(이상치 차단)
function clampKeyboardHeight(h: number) {
  const n = Math.round(h);
  if (!Number.isFinite(n)) return null;
  if (n < 180) return null;
  if (n > 520) return null;
  return n;
}

export async function getPersistedKeyboardHeight(): Promise<number | null> {
  try {
    const col = database.get<AppSetting>(TABLE);

    // id로 바로 찾는 방식이 가장 빠름
    const rec = await col.find(SINGLETON_ID).catch(() => null);
    if (!rec) return null;

    const h = rec.keyboard_height;
    const ok = typeof h === 'number' ? clampKeyboardHeight(h) : null;
    return ok;
  } catch {
    return null;
  }
}

export async function upsertPersistedKeyboardHeight(height: number): Promise<void> {
  const h = clampKeyboardHeight(height);
  if (h == null) return;

  const col = database.get<AppSetting>(TABLE);

  await database.write(async () => {
    const existing = await col.find(SINGLETON_ID).catch(() => null);

    if (existing) {
      await existing.setKeyboardHeight(h);
      return;
    }

    await col.create((rec) => {
      rec._raw.id = SINGLETON_ID;
      (rec as any).keyboard_height = h;
      (rec as any).updated_at = Date.now();
    });
  });
}
