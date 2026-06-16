import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class MessageTranslation extends Model {
  static table = 'message_translations';

  @field('message_id') messageId!: string;
  @field('room_id') roomId!: number;
  @field('user_id') userId!: string;
  @field('purpose') purpose!: string;

  // 'content' | 'original'
  @field('from_mode') fromMode!: string;

  // ko | en | ja ...
  @field('target_lang') targetLang!: string;

  // free | mid | high
  @field('generated_tier') generatedTier!: string;

  // business | polite | casual | neutral | creative
  @field('tone') tone!: string;

  // openai | deepl | none
  @field('provider') provider!: string;

  @field('translated_text') translatedText!: string;

  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
