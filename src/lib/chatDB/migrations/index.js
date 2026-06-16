import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'messages',
          columns: [
            { name: 'is_secure', type: 'boolean', isOptional: true, isIndexed: true },
            { name: 'secure_epoch', type: 'number', isOptional: true, isIndexed: true },
            { name: 'secure_sender_device_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'cipher_suite', type: 'string', isOptional: true },
            { name: 'ciphertext', type: 'string', isOptional: true },
            { name: 'nonce', type: 'string', isOptional: true },
            { name: 'aad_version', type: 'number', isOptional: true },
            { name: 'secure_meta', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'room_read_states',
          columns: [
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'last_read_seq', type: 'number', isIndexed: true },
            { name: 'is_active', type: 'boolean', isOptional: true, isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'messages',
          columns: [
            { name: 'notice_pinned_at', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },

    {
      toVersion: 5,
      steps: [
        createTable({
          name: 'message_bookmarks',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'message_uid', type: 'string', isIndexed: true },
            { name: 'message_id', type: 'number', isOptional: true, isIndexed: true },
            { name: 'room_seq', type: 'number', isOptional: true, isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number', isIndexed: true },
            { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'sync_state', type: 'string', isIndexed: true },
            { name: 'synced_at', type: 'number', isOptional: true },
            { name: 'last_error', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'message_reactions',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'message_uid', type: 'string', isIndexed: true },
            { name: 'message_id', type: 'number', isOptional: true, isIndexed: true },
            { name: 'room_seq', type: 'number', isOptional: true, isIndexed: true },
            { name: 'reaction_key', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number', isIndexed: true },
            { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'sync_state', type: 'string', isIndexed: true },
            { name: 'synced_at', type: 'number', isOptional: true },
            { name: 'last_error', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'message_reaction_counts',
          columns: [
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'message_uid', type: 'string', isIndexed: true },
            { name: 'reaction_key', type: 'string', isIndexed: true },
            { name: 'count', type: 'number' },
            { name: 'updated_at', type: 'number', isIndexed: true },
          ],
        }),
      ],
    },

    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'rooms',
          columns: [
            { name: 'member_count', type: 'number', isOptional: true },
          ],
        }),
      ],
    },

    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'room_open_snapshots',
          columns: [
            { name: 'room_id', type: 'number', isIndexed: true },
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'items_json', type: 'string' },
            { name: 'last_seq', type: 'number', isOptional: true, isIndexed: true },
            { name: 'tail_signature', type: 'string', isOptional: true },
            { name: 'item_count', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number', isIndexed: true },
          ],
        }),
      ],
    },
  ],
});
