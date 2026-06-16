# Push Recipient Snapshot Contract v1

## 목표
수신자 기준으로 푸시 표시 내용을 이미 확정된 snapshot 형태로 `notification_outbox.template_args`에 저장한다.

## 1:1
- title = `room_title` (수신자 입장의 `chat_members.room_name`)
- hero image = `use_default_cover=true` 이면 상대 프로필 사진, 아니면 방 커버
- small icon = 앱 아이콘
- body = `display_body_for_push`
- actions = read / reply
- tap = deeplink(room_id)

## 그룹
- title = `room_title` (수신자 입장의 `chat_members.room_name` 우선, 없으면 방 제목)
- hero image = `use_default_cover=true` 이면 기본 방사진/콜라주, 아니면 방 커버
- small icon = 앱 아이콘
- body = `sender_nickname + ": " + display_body_for_push`
- actions = read / reply
- tap = deeplink(room_id)

## template_args 필수 키
```json
{
  "room_id": 8,
  "room_seq": 870,
  "room_type": "dm",
  "room_title": "홍길동",
  "sender_id": "uuid",
  "sender_nickname": "홍길동",
  "sender_avatar_url": "https://...",
  "room_avatar_url": "https://...",
  "use_default_cover": true,
  "message_uid": "uuid",
  "message_kind": "text",
  "display_body_for_push": "원문 미리보기",
  "preview_text_original": "원문 미리보기"
}
```

## 권장 규칙
- `room_title` 는 recipient 기준 완성값
- `display_body_for_push` 는 즉시성 우선 원문 preview
- `content` / `translated_text` 는 앱 내부 표시용으로 유지 가능
- worker는 snapshot 렌더링만 하고, 별도 조회를 최소화한다
