import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export type ChatReactionKey = 'heart' | 'like' | 'check' | 'laugh' | 'surprise' | 'sad';
export type MessageReactionSyncState = 'synced' | 'pending_upsert' | 'pending_delete' | 'failed';

export default class MessageReaction extends Model {
  static table = 'message_reactions';

  @text('user_id') userId!: string;
  @field('room_id') roomId!: number;
  @text('message_uid') messageUid!: string;
  @field('message_id') messageId!: number | null;
  @field('room_seq') roomSeq!: number | null;
  @text('reaction_key') reactionKey!: ChatReactionKey;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  @field('deleted_at') deletedAt!: number | null;
  @text('sync_state') syncState!: MessageReactionSyncState;
  @field('synced_at') syncedAt!: number | null;
  @text('last_error') lastError!: string | null;

  get isActive(): boolean {
    return this.deletedAt == null;
  }

  get isPending(): boolean {
    return this.syncState === 'pending_upsert' || this.syncState === 'pending_delete';
  }
}
