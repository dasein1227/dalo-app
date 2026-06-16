import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import type { ChatReactionKey } from './MessageReaction';

export default class MessageReactionCount extends Model {
  static table = 'message_reaction_counts';

  @field('room_id') roomId!: number;
  @text('message_uid') messageUid!: string;
  @text('reaction_key') reactionKey!: ChatReactionKey;
  @field('count') count!: number;
  @field('updated_at') updatedAt!: number;
}
