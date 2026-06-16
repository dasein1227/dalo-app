import { Model } from '@nozbe/watermelondb';
import { field, relation, text } from '@nozbe/watermelondb/decorators';

export default class Attachment extends Model {
  static table = 'chat_attachments';

  @text('message_id') message_id!: string;
  @field('room_id') room_id!: number;
  @field('sort_order') sort_order!: number | null;

  @text('type') type!: string | null;
  @text('url') url!: string;
  @text('thumb_url') thumb_url!: string | null;
  @text('mime') mime!: string | null;

  @field('width') width!: number | null;
  @field('height') height!: number | null;
  @field('aspect') aspect!: number | null;
  @field('duration_ms') duration_ms!: number | null;

  @text('file_name') file_name!: string | null;
  @field('file_size') file_size!: number | null;
  @text('provider') provider!: string | null;

  @field('created_at') created_at!: number | null;

  @relation('messages', 'message_id') message!: any;
}
