// src/lib/chatDB/models/RoomOpenSnapshot.ts
import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export default class RoomOpenSnapshot extends Model {
  static table = "room_open_snapshots";

  @field("room_id") room_id!: number;
  @text("user_id") user_id!: string;
  @text("items_json") items_json!: string;
  @field("last_seq") last_seq!: number | null;
  @text("tail_signature") tail_signature!: string | null;
  @field("item_count") item_count!: number | null;
  @field("created_at") created_at!: number;
  @field("updated_at") updated_at!: number;
}
