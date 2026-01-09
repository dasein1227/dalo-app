// src/lib/chatDB/models/Message.ts
import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type LinkPreviewStatus = 'none' | 'pending' | 'ready' | 'error';

export default class Message extends Model {
  static table = 'messages';

  @field('room_id') room_id!: number;
  @field('sender_id') sender_id!: string;

  // per-room monotonic sequence (nullable for legacy rows)
  @field('room_seq') room_seq!: number | null;

  @field('original') original!: string | null;
  @field('content') content!: string | null;

  @field('translated_text') translated_text!: string | null;

  @field('kind') kind!: string;
  @field('is_notice') is_notice!: boolean;

  @field('created_at') created_at!: number;

  // unified delete timestamp (ms). null means not scheduled.
  @field('delete_at') delete_at!: number | null;

  @field('client_msg_id') client_msg_id!: string | null;

  @field('link_preview') link_preview!: string | null;
  @field('link_preview_url') link_preview_url!: string | null;
  @field('link_preview_status') link_preview_status!: string | null;

  get isLocal() {
    return String(this.id).startsWith('local_');
  }

  get createdAt(): number {
    return Number(this.created_at ?? 0) || 0;
  }

  // UI/정렬에서 쓸 안전한 seq
  get roomSeq(): number {
    const n = Number(this.room_seq ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }

  @writer
  async updateFromServer(payload: {
    room_id: number | string;
    sender_id: string;
    room_seq?: number | string | null;

    original: string | null;
    content: string | null;
    translated_text?: string | null;

    kind: string | null;
    is_notice: boolean | null;

    created_at: number | string;
    client_msg_id?: string | null;

    // ✅ NEW: delete_at (server timestamptz ISO or ms)
    delete_at?: string | number | null;

    link_preview?: any | null;
    link_preview_url?: string | null;
    link_preview_status?: LinkPreviewStatus | string | null;
  }) {
    await this.update((m: any) => {
      // room_id는 number로 강제 (Q.where('room_id', roomId) 정합)
      m.room_id = Number(payload.room_id);
      m.sender_id = payload.sender_id;

      // created_at: string(ISO) -> ms(number)
      if (typeof payload.created_at === 'string') {
        const ms = new Date(payload.created_at).getTime();
        m.created_at = Number.isFinite(ms) ? ms : 0;
      } else {
        m.created_at = Number(payload.created_at ?? 0) || 0;
      }

      if (payload.room_seq != null) {
        const rs = Number(payload.room_seq);
        m.room_seq = Number.isFinite(rs) && rs > 0 ? Math.trunc(rs) : null;
      }

      // ✅ delete_at: string(ISO) | number(ms) | null
      if (payload.delete_at !== undefined) {
        const v: any = payload.delete_at;
        if (v == null) {
          m.delete_at = null;
        } else if (typeof v === 'string') {
          const ms = new Date(v).getTime();
          m.delete_at = Number.isFinite(ms) ? ms : null;
        } else {
          const ms = Number(v);
          m.delete_at = Number.isFinite(ms) ? ms : null;
        }
      }

      m.original = payload.original ?? null;
      m.content = payload.content ?? null;
      if (payload.translated_text !== undefined) m.translated_text = payload.translated_text ?? null;

      m.kind = payload.kind ?? 'text';
      m.is_notice = payload.is_notice ?? false;

      if (payload.client_msg_id !== undefined) m.client_msg_id = payload.client_msg_id ?? null;

      if (payload.link_preview !== undefined) {
        m.link_preview =
          payload.link_preview == null
            ? null
            : typeof payload.link_preview === 'string'
              ? payload.link_preview
              : JSON.stringify(payload.link_preview);
      }

      if (payload.link_preview_url !== undefined) m.link_preview_url = payload.link_preview_url ?? null;

      if (payload.link_preview_status !== undefined) {
        const v = String(payload.link_preview_status ?? '').trim();
        m.link_preview_status = v === 'pending' || v === 'ready' || v === 'error' ? v : 'none';
      }
    });
  }

  // pull.ts에서 fast-path로 쓰는 helper (타입 방어 포함)
  applyRow(payload: any) {
    (this as any).room_id = Number(payload.room_id);
    (this as any).sender_id = String(payload.sender_id ?? '');

    const rs = payload.room_seq;
    if (rs != null) {
      const n = Number(rs);
      (this as any).room_seq = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }

    // ✅ delete_at
    if (payload.delete_at !== undefined) {
      const v: any = payload.delete_at;
      if (v == null) {
        (this as any).delete_at = null;
      } else if (typeof v === 'string') {
        const ms = new Date(v).getTime();
        (this as any).delete_at = Number.isFinite(ms) ? ms : null;
      } else {
        const ms = Number(v);
        (this as any).delete_at = Number.isFinite(ms) ? ms : null;
      }
    }

    (this as any).original = payload.original ?? null;
    (this as any).content = payload.content ?? null;
    if (payload.translated_text !== undefined) (this as any).translated_text = payload.translated_text ?? null;

    (this as any).kind = payload.kind ?? 'text';
    (this as any).is_notice = payload.is_notice ?? false;

    if (typeof payload.created_at === 'string') {
      const ms = new Date(payload.created_at).getTime();
      (this as any).created_at = Number.isFinite(ms) ? ms : 0;
    } else {
      (this as any).created_at = Number(payload.created_at ?? 0) || 0;
    }

    if (payload.client_msg_id !== undefined) (this as any).client_msg_id = payload.client_msg_id ?? null;

    if (payload.link_preview !== undefined) {
      (this as any).link_preview =
        payload.link_preview == null
          ? null
          : typeof payload.link_preview === 'string'
            ? payload.link_preview
            : JSON.stringify(payload.link_preview);
    }
    if (payload.link_preview_url !== undefined) (this as any).link_preview_url = payload.link_preview_url ?? null;
    if (payload.link_preview_status !== undefined) {
      const v = String(payload.link_preview_status ?? '').trim();
      (this as any).link_preview_status = v === 'pending' || v === 'ready' || v === 'error' ? v : 'none';
    }
  }
}
