import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export type MessageBookmarkSyncState = 'synced' | 'pending_upsert' | 'pending_delete' | 'failed';

export default class MessageBookmark extends Model {
  static table = 'message_bookmarks';

  @text('user_id') userId!: string;
  @field('room_id') roomId!: number;
  @text('message_uid') messageUid!: string;
  @field('message_id') messageId!: number | null;
  @field('room_seq') roomSeq!: number | null;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  @field('deleted_at') deletedAt!: number | null;
  @text('sync_state') syncState!: MessageBookmarkSyncState;
  @field('synced_at') syncedAt!: number | null;
  @text('last_error') lastError!: string | null;

  get isActive(): boolean {
    return this.deletedAt == null;
  }

  get isPending(): boolean {
    return this.syncState === 'pending_upsert' || this.syncState === 'pending_delete';
  }
}
