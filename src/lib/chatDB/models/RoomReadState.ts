// src/lib/chatDB/models/RoomReadState.ts
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class RoomReadState extends Model {
  static table = 'room_read_states';

  @field('room_id') room_id!: number;
  @text('user_id') user_id!: string;
  @field('last_read_seq') last_read_seq!: number;
  @field('is_active') is_active!: boolean;
  @field('updated_at') updated_at!: number;
}
