// src/lib/chatDB/models/Profile.ts
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Profile extends Model {
  static table = 'profiles';

  @field('user_id') userId!: string;
  @field('nickname') nickname!: string;
  @field('avatar_url') avatarUrl!: string;
}
