import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class Room extends Model {
  static table = 'rooms';

  // 1. 기본 정보
  @text('title') title!: string;
  @text('last_msg') last_msg!: string | null;
  @text('avatar_url') avatar_url!: string | null;

  // 2. 핵심 상태 정보
  @field('unread_count') unread_count!: number; // 뱃지용
  @field('is_pinned') is_pinned!: boolean;      // 상단 고정
  @field('member_count') member_count!: number | null; // 그룹/오픈/비콘 참가자 수

  // 3. 구분 정보 (개인/그룹/오픈/비콘)
  @text('type') type!: string; 
  @text('subtype') subtype!: string | null;
  
  // 4. 비즈니스/비콘 연동 ID
  @field('beacon_id') beacon_id!: number | null;
  @text('business_id') business_id!: string | null;

  // 5. 시간 정보 (@date를 쓰면 자동으로 Date 객체로 변환해줘서 정렬이 편해집니다)
  @date('updated_at') updated_at!: Date; 
}