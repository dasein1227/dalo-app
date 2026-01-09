import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

// src/lib/chatDB/migrations/index.ts
// - Normalize add_columns format (array)
// - Add toVersion 6: messages.room_seq
// - Add toVersion 7: messages.delete_at

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        {
          type: 'add_columns',
          table: 'messages',
          columns: [{ name: 'translated_text', type: 'string', isOptional: true }],
        },
      ],
    },
    {
      toVersion: 3,
      steps: [
        {
          type: 'create_table',
          table: 'message_translations',
          columns: [
            { name: 'message_id', type: 'string', isIndexed: true },
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'user_id', type: 'string', isIndexed: true },

            { name: 'purpose', type: 'string', isIndexed: true },

            { name: 'target_lang', type: 'string' },
            { name: 'generated_tier', type: 'string' },
            { name: 'translated_text', type: 'string' },

            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        },
      ],
    },
    {
      toVersion: 4,
      steps: [
        {
          type: 'add_columns',
          table: 'messages',
          columns: [
            { name: 'link_preview', type: 'string', isOptional: true },
            { name: 'link_preview_url', type: 'string', isOptional: true },
            { name: 'link_preview_status', type: 'string', isOptional: true },
          ],
        },
      ],
    },
    {
      toVersion: 5,
      steps: [
        {
          type: 'add_columns',
          table: 'messages',
          columns: [{ name: 'client_msg_id', type: 'string', isOptional: true }],
        },
      ],
    },
    {
      toVersion: 6,
      steps: [
        {
          type: 'add_columns',
          table: 'messages',
          columns: [{ name: 'room_seq', type: 'number', isOptional: true }],
        },
      ],
    },

    // ✅ NEW: unified delete timestamp (ms)
    {
      toVersion: 7,
      steps: [
        {
          type: 'add_columns',
          table: 'messages',
          columns: [{ name: 'delete_at', type: 'number', isOptional: true }],
        },
      ],
    },
  ],
});
