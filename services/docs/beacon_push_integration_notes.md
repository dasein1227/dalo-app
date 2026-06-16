# Beacon Push i18n / Android Integration Pack

This pack contains the first concrete implementation step for beacon push:

1. `beacon_push_i18n.ts`
   - Locale bundle for beacon push.
   - Covers the locale codes already normalized by current chat/social workers:
     `ko`, `ja`, `en`, `zh-CN`, `zh-TW`, `th`, `vi`, `id`, `es`, `fr`, `de`, `pt-BR`.

2. `BeaconPushNotificationHelper.kt`
   - Native Android rich push renderer for beacon events.
   - Supports:
     - `beacon.created`
     - `beacon.join_request.created`
     - `beacon.join_approved`

3. `CoonnFirebaseMessagingService.kt`
   - Updated to route beacon payloads before social/chat.

## Expected payload contract

The server beacon worker should send these keys at minimum:

- `event_type`
- `notification_kind=beacon`
- `beacon_type`
- `outbox_id`
- `entity_type`
- `entity_id`
- `beacon_id`
- `host_id`
- `actor_user_id`
- `actor_nickname`
- `actor_avatar_url`
- `beacon_title`
- `distance_m`
- `require_approval` (`1` or `0`)
- `notification_title`
- `notification_subtitle`
- `notification_body`
- `image_url_primary`
- `large_image_url`
- `dedupe_key`
- `collapse_key`
- `deeplink`

## Android string resources required

The helper references these string resource names:

- `push_someone`
- `push_channel_beacon_name`
- `push_channel_beacon_description`
- `push_beacon_created_title`
- `push_beacon_created_body`
- `push_beacon_created_body_no_distance`
- `push_beacon_entry_open`
- `push_beacon_entry_approval`
- `push_beacon_join_request_title`
- `push_beacon_join_request_body`
- `push_beacon_join_approved_title`
- `push_beacon_join_approved_body`

## Recommended next step

Next concrete step should be:

- Create `services/push/beacon_push_worker.ts`
- Reuse social worker locale resolution order
- Inject `BEACON_LOCALE_FALLBACKS`
- Render the 3 beacon event payloads server-side
- Keep `lane_group='beacon'`
