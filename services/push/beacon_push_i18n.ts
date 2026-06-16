export type BeaconLocalePack = Record<string, unknown>;

/**
 * Beacon push locale bundle.
 *
 * Aligns with the locale normalization already used in chat/social workers:
 * ko, ja, en, th, vi, id, es, fr, de, pt-BR, zh-CN, zh-TW
 */
export const BEACON_LOCALE_FALLBACKS: Record<string, BeaconLocalePack> = {
  en: {
    push: {
      common: {
        someone: 'Someone',
        new_notification: 'New notification',
        new_notification_body: 'You have a new notification.',
      },
      beacon: {
        entry_open: 'Open entry',
        entry_approval: 'Approval required',
        created_title: '{{actor}} opened a nearby beacon',
        created_body: '"{{title}}" · {{distance}}m · {{entry}}',
        created_body_no_distance: '"{{title}}" · {{entry}}',
        join_request_title: 'New join request',
        join_request_body: '{{actor}} requested to join "{{title}}"',
        join_approved_title: 'Beacon join approved',
        join_approved_body: 'Your request to join "{{title}}" was approved',
        generic_body: 'There is a new beacon update.',
      },
    },
  },
  ko: {
    push: {
      common: {
        someone: '누군가',
        new_notification: '새 알림',
        new_notification_body: '새 알림이 도착했습니다.',
      },
      beacon: {
        entry_open: '바로 입장 가능',
        entry_approval: '승인제',
        created_title: '{{actor}}님이 근처에서 비콘을 열었어요',
        created_body: '"{{title}}" · {{distance}}m · {{entry}}',
        created_body_no_distance: '"{{title}}" · {{entry}}',
        join_request_title: '새 참여 요청이 왔어요',
        join_request_body: '{{actor}}님이 "{{title}}" 참여를 요청했어요',
        join_approved_title: '비콘 참여가 승인됐어요',
        join_approved_body: '"{{title}}"에 입장할 수 있어요',
        generic_body: '새 비콘 알림이 있습니다.',
      },
    },
  },
  ja: {
    push: {
      common: {
        someone: '誰か',
        new_notification: '新しい通知',
        new_notification_body: '新しい通知があります。',
      },
      beacon: {
        entry_open: 'すぐ参加可能',
        entry_approval: '承認制',
        created_title: '{{actor}}さんが近くでビーコンを開きました',
        created_body: '「{{title}}」・{{distance}}m・{{entry}}',
        created_body_no_distance: '「{{title}}」・{{entry}}',
        join_request_title: '新しい参加リクエスト',
        join_request_body: '{{actor}}さんが「{{title}}」への参加をリクエストしました',
        join_approved_title: 'ビーコン参加が承認されました',
        join_approved_body: '「{{title}}」に参加できます',
        generic_body: '新しいビーコン通知があります。',
      },
    },
  },
  'zh-CN': {
    push: {
      common: {
        someone: '有人',
        new_notification: '新通知',
        new_notification_body: '你收到一条新通知。',
      },
      beacon: {
        entry_open: '可直接加入',
        entry_approval: '需审批',
        created_title: '{{actor}} 在附近开启了 Beacon',
        created_body: '“{{title}}” · {{distance}}米 · {{entry}}',
        created_body_no_distance: '“{{title}}” · {{entry}}',
        join_request_title: '新的加入申请',
        join_request_body: '{{actor}} 申请加入 “{{title}}”',
        join_approved_title: 'Beacon 加入已获批准',
        join_approved_body: '你现在可以进入 “{{title}}”',
        generic_body: '你有新的 Beacon 通知。',
      },
    },
  },
  'zh-TW': {
    push: {
      common: {
        someone: '有人',
        new_notification: '新通知',
        new_notification_body: '你收到一則新通知。',
      },
      beacon: {
        entry_open: '可直接加入',
        entry_approval: '需審核',
        created_title: '{{actor}} 在附近開啟了 Beacon',
        created_body: '「{{title}}」· {{distance}}公尺 · {{entry}}',
        created_body_no_distance: '「{{title}}」· {{entry}}',
        join_request_title: '新的加入申請',
        join_request_body: '{{actor}} 申請加入「{{title}}」',
        join_approved_title: 'Beacon 參加已核准',
        join_approved_body: '你現在可以進入「{{title}}」',
        generic_body: '你有新的 Beacon 通知。',
      },
    },
  },
  th: {
    push: {
      common: {
        someone: 'มีคนหนึ่ง',
        new_notification: 'การแจ้งเตือนใหม่',
        new_notification_body: 'คุณมีการแจ้งเตือนใหม่',
      },
      beacon: {
        entry_open: 'เข้าร่วมได้ทันที',
        entry_approval: 'ต้องรอการอนุมัติ',
        created_title: '{{actor}} เปิดบีคอนใกล้คุณ',
        created_body: '“{{title}}” · {{distance}} ม. · {{entry}}',
        created_body_no_distance: '“{{title}}” · {{entry}}',
        join_request_title: 'มีคำขอเข้าร่วมใหม่',
        join_request_body: '{{actor}} ขอเข้าร่วม “{{title}}”',
        join_approved_title: 'คำขอเข้าร่วมบีคอนได้รับการอนุมัติแล้ว',
        join_approved_body: 'ตอนนี้คุณเข้าร่วม “{{title}}” ได้แล้ว',
        generic_body: 'คุณมีการแจ้งเตือนบีคอนใหม่',
      },
    },
  },
  vi: {
    push: {
      common: {
        someone: 'Ai đó',
        new_notification: 'Thông báo mới',
        new_notification_body: 'Bạn có một thông báo mới.',
      },
      beacon: {
        entry_open: 'Vào ngay',
        entry_approval: 'Cần phê duyệt',
        created_title: '{{actor}} đã mở một beacon gần bạn',
        created_body: '“{{title}}” · {{distance}}m · {{entry}}',
        created_body_no_distance: '“{{title}}” · {{entry}}',
        join_request_title: 'Yêu cầu tham gia mới',
        join_request_body: '{{actor}} đã yêu cầu tham gia “{{title}}”',
        join_approved_title: 'Yêu cầu tham gia beacon đã được chấp thuận',
        join_approved_body: 'Bạn có thể vào “{{title}}” ngay bây giờ',
        generic_body: 'Bạn có thông báo beacon mới.',
      },
    },
  },
  id: {
    push: {
      common: {
        someone: 'Seseorang',
        new_notification: 'Notifikasi baru',
        new_notification_body: 'Anda memiliki notifikasi baru.',
      },
      beacon: {
        entry_open: 'Bisa langsung masuk',
        entry_approval: 'Perlu persetujuan',
        created_title: '{{actor}} membuka beacon di dekat Anda',
        created_body: '"{{title}}" · {{distance}}m · {{entry}}',
        created_body_no_distance: '"{{title}}" · {{entry}}',
        join_request_title: 'Permintaan bergabung baru',
        join_request_body: '{{actor}} meminta bergabung ke "{{title}}"',
        join_approved_title: 'Permintaan bergabung ke beacon disetujui',
        join_approved_body: 'Sekarang Anda bisa masuk ke "{{title}}"',
        generic_body: 'Ada notifikasi beacon baru.',
      },
    },
  },
  es: {
    push: {
      common: {
        someone: 'Alguien',
        new_notification: 'Nueva notificación',
        new_notification_body: 'Tienes una nueva notificación.',
      },
      beacon: {
        entry_open: 'Entrada directa',
        entry_approval: 'Requiere aprobación',
        created_title: '{{actor}} abrió un beacon cerca de ti',
        created_body: '"{{title}}" · {{distance}} m · {{entry}}',
        created_body_no_distance: '"{{title}}" · {{entry}}',
        join_request_title: 'Nueva solicitud para unirse',
        join_request_body: '{{actor}} solicitó unirse a "{{title}}"',
        join_approved_title: 'Tu solicitud al beacon fue aprobada',
        join_approved_body: 'Ahora puedes entrar en "{{title}}"',
        generic_body: 'Tienes una nueva notificación de beacon.',
      },
    },
  },
  fr: {
    push: {
      common: {
        someone: 'Quelqu’un',
        new_notification: 'Nouvelle notification',
        new_notification_body: 'Vous avez une nouvelle notification.',
      },
      beacon: {
        entry_open: 'Entrée directe',
        entry_approval: 'Approbation requise',
        created_title: '{{actor}} a ouvert un beacon près de vous',
        created_body: '« {{title}} » · {{distance}} m · {{entry}}',
        created_body_no_distance: '« {{title}} » · {{entry}}',
        join_request_title: 'Nouvelle demande de participation',
        join_request_body: '{{actor}} a demandé à rejoindre « {{title}} »',
        join_approved_title: 'Participation au beacon approuvée',
        join_approved_body: 'Vous pouvez maintenant entrer dans « {{title}} »',
        generic_body: 'Vous avez une nouvelle notification beacon.',
      },
    },
  },
  de: {
    push: {
      common: {
        someone: 'Jemand',
        new_notification: 'Neue Benachrichtigung',
        new_notification_body: 'Du hast eine neue Benachrichtigung.',
      },
      beacon: {
        entry_open: 'Direkter Eintritt',
        entry_approval: 'Freigabe erforderlich',
        created_title: '{{actor}} hat einen Beacon in deiner Nähe geöffnet',
        created_body: '„{{title}}“ · {{distance}} m · {{entry}}',
        created_body_no_distance: '„{{title}}“ · {{entry}}',
        join_request_title: 'Neue Beitrittsanfrage',
        join_request_body: '{{actor}} möchte „{{title}}“ beitreten',
        join_approved_title: 'Beacon-Beitritt genehmigt',
        join_approved_body: 'Du kannst jetzt „{{title}}“ betreten',
        generic_body: 'Du hast eine neue Beacon-Benachrichtigung.',
      },
    },
  },
  'pt-BR': {
    push: {
      common: {
        someone: 'Alguém',
        new_notification: 'Nova notificação',
        new_notification_body: 'Você tem uma nova notificação.',
      },
      beacon: {
        entry_open: 'Entrada imediata',
        entry_approval: 'Requer aprovação',
        created_title: '{{actor}} abriu um beacon perto de você',
        created_body: '"{{title}}" · {{distance}} m · {{entry}}',
        created_body_no_distance: '"{{title}}" · {{entry}}',
        join_request_title: 'Nova solicitação para entrar',
        join_request_body: '{{actor}} solicitou entrar em "{{title}}"',
        join_approved_title: 'Sua entrada no beacon foi aprovada',
        join_approved_body: 'Agora você pode entrar em "{{title}}"',
        generic_body: 'Você tem uma nova notificação de beacon.',
      },
    },
  },
};
