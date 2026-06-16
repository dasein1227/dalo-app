// src/lib/chatDB/schema/messageTranslations.ts
import { tableSchema } from '@nozbe/watermelondb';

export const messageTranslationsSchema = tableSchema({
  name: 'message_translations',
  columns: [
    // Manual/swipe translations are local-only and must not be overwritten by server sync.
    // Watermelon row id is used as a deterministic cache key.
    { name: 'message_id', type: 'string', isIndexed: true },
    { name: 'room_id', type: 'number', isIndexed: true },
    { name: 'user_id', type: 'string', isIndexed: true },
    { name: 'purpose', type: 'string', isIndexed: true },
    { name: 'from_mode', type: 'string', isOptional: true }, // 'content' | 'original'
    { name: 'tone', type: 'string', isOptional: true },
    { name: 'provider', type: 'string', isOptional: true }, // openai | deepl | none
    { name: 'target_lang', type: 'string' },
    { name: 'generated_tier', type: 'string' }, // free | mid | high
    { name: 'translated_text', type: 'string' },
    { name: 'created_at', type: 'number', isIndexed: true },
    { name: 'updated_at', type: 'number' },
  ],
});
