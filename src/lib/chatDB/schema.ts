import { appSchema, tableSchema } from '@nozbe/watermelondb';

// src/lib/chatDB/schema.ts
// version 7: add messages.delete_at (nullable, ms) for unified delete system

export const chatSchema = appSchema({
  version: 7,

  tables: [
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'room_id', type: 'number', isIndexed: true },
        { name: 'sender_id', type: 'string', isIndexed: true },

        { name: 'client_msg_id', type: 'string', isOptional: true, isIndexed: true },

        { name: 'content', type: 'string', isOptional: true },
        { name: 'original', type: 'string', isOptional: true },

        { name: 'translated_text', type: 'string', isOptional: true },

        // link preview
        { name: 'link_preview', type: 'string', isOptional: true },
        { name: 'link_preview_url', type: 'string', isOptional: true, isIndexed: true },
        { name: 'link_preview_status', type: 'string', isOptional: true },

        // NEW: per-room sequence
        { name: 'room_seq', type: 'number', isOptional: true, isIndexed: true },

        // NEW: unified delete timestamp (ms). When (now + serverOffset) >= delete_at => hard delete locally.
        { name: 'delete_at', type: 'number', isOptional: true, isIndexed: true },

        { name: 'created_at', type: 'number' },
        { name: 'kind', type: 'string' },
        { name: 'is_notice', type: 'boolean', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'rooms',
      columns: [
        { name: 'title', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'nickname', type: 'string', isOptional: true },
        { name: 'avatar_url', type: 'string', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'message_translations',
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
    }),
  ],
});

export default chatSchema;
