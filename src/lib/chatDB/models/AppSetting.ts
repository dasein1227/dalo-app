import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export default class AppSetting extends Model {
  static table = 'app_settings';

  // 마지막으로 확인된 키보드 높이(px)
  @field('keyboard_height') keyboard_height!: number | null;

  // 필요하면 추후 확장
  @field('updated_at') updated_at!: number | null;

  @writer async setKeyboardHeight(h: number) {
    await this.update((rec) => {
      rec.keyboard_height = h;
      rec.updated_at = Date.now();
    });
  }
}
