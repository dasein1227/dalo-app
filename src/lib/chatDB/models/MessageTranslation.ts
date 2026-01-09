import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class MessageTranslation extends Model {
  static table = 'message_translations';

  @field('message_id') messageId!: string;
  @field('room_id') roomId!: string;
  @field('user_id') userId!: string;

  @field('purpose') purpose!: string; // 'my_view' | 'delivered_to_peer'
  @field('target_lang') targetLang!: string;
  @field('generated_tier') generatedTier!: string; // free/mid/high
  @field('translated_text') translatedText!: string;

  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
