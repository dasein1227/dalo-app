// src/lib/chatDB/adapter.ts
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { chatSchema } from './schema';
import migrations from './migrations';

export const adapter = new SQLiteAdapter({
  schema: chatSchema,
  migrations,
  jsi: true, // JSI 모드 → 성능
  onSetUpError: (err) => {
    console.error('WatermelonDB setup error', err);
  },
});
