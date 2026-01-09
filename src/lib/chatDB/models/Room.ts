// src/lib/chatDB/models/Room.ts
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Room extends Model {
  static table = 'rooms';

  @field('title') title!: string;
  @field('updated_at') updatedAt!: number;
}
