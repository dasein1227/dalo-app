/* eslint-disable no-console */
// CO·ONN settings notification i18n merge script
// Run from project root:
//   node ./scripts/merge-settings-notification-i18n.cjs
//
// Scope:
// - Adds Settings > Notification i18n keys for push types and in-app notification preferences.
// - Removes notification.field.friend_request from each locale settings.json.
// - Preserves all existing unrelated keys.

const fs = require('fs');
const path = require('path');

const LOCALE_PATCHES = {
  "ko": {
    "caption": "푸시, 인앱 알림, 소리",
    "section": {
      "defaults": "기본",
      "types": "유형",
      "push_types": "푸시 유형",
      "quiet": "조용한 시간",
      "in_app": "인앱 알림"
    },
    "field": {
      "push": "푸시 알림",
      "preview": "미리보기",
      "sound": "소리",
      "vibrate": "진동",
      "chat": "채팅",
      "system": "공지·시스템",
      "marketing": "마케팅"
    },
    "help": {
      "push": "전체 푸시 알림",
      "preview": "잠금화면에 내용 표시",
      "chat_push": "채팅 메시지 푸시",
      "system_push": "서비스 안내와 주요 공지",
      "marketing_push": "이벤트와 프로모션"
    },
    "in_app": {
      "master": "인앱 알림",
      "master_help": "앱 안 알림함에 표시",
      "group": {
        "social": "소셜",
        "chat": "채팅",
        "beacon": "비콘",
        "schedule": "일정",
        "post": "게시물"
      },
      "follow_created": "새 팔로워",
      "follow_created_help": "나를 팔로우했을 때",
      "chat_reply": "답장",
      "chat_reply_help": "내 메시지에 답장했을 때",
      "chat_mention": "멘션",
      "chat_mention_help": "나를 멘션했을 때",
      "beacon_join_request": "참여 요청",
      "beacon_join_request_help": "비콘 참여 요청이 왔을 때",
      "beacon_join_approved": "참여 승인",
      "beacon_join_approved_help": "비콘 참여가 승인됐을 때",
      "beacon_friend_created": "친구 비콘",
      "beacon_friend_created_help": "친구가 비콘을 만들었을 때",
      "schedule_created": "새 일정",
      "schedule_created_help": "참여 중인 방에 일정이 생겼을 때",
      "schedule_updated": "일정 변경",
      "schedule_updated_help": "참여 중인 일정이 변경됐을 때",
      "schedule_cancelled": "일정 취소",
      "schedule_cancelled_help": "참여 중인 일정이 취소됐을 때",
      "post_like": "좋아요",
      "post_like_help": "내 게시물에 좋아요가 모였을 때",
      "post_comment": "댓글",
      "post_comment_help": "내 게시물에 댓글이 달렸을 때",
      "post_reply": "답글",
      "post_reply_help": "내 댓글에 답글이 달렸을 때",
      "post_mention": "게시물 멘션",
      "post_mention_help": "게시물이나 댓글에서 나를 멘션했을 때"
    }
  },
  "en": {
    "caption": "Push, in-app alerts, sound",
    "section": {
      "defaults": "Default",
      "types": "Types",
      "push_types": "Push types",
      "quiet": "Quiet hours",
      "in_app": "In-app alerts"
    },
    "field": {
      "push": "Push notifications",
      "preview": "Preview",
      "sound": "Sound",
      "vibrate": "Vibration",
      "chat": "Chat",
      "system": "Notices & system",
      "marketing": "Marketing"
    },
    "help": {
      "push": "All push notifications",
      "preview": "Show content on lock screen",
      "chat_push": "Chat message push",
      "system_push": "Service notices and key updates",
      "marketing_push": "Events and promotions"
    },
    "in_app": {
      "master": "In-app alerts",
      "master_help": "Shown in the app inbox",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacons",
        "schedule": "Schedules",
        "post": "Posts"
      },
      "follow_created": "New follower",
      "follow_created_help": "When someone follows you",
      "chat_reply": "Replies",
      "chat_reply_help": "When someone replies to your message",
      "chat_mention": "Mentions",
      "chat_mention_help": "When someone mentions you",
      "beacon_join_request": "Join requests",
      "beacon_join_request_help": "When a beacon join request arrives",
      "beacon_join_approved": "Join approved",
      "beacon_join_approved_help": "When your beacon join is approved",
      "beacon_friend_created": "Friend beacons",
      "beacon_friend_created_help": "When a friend creates a beacon",
      "schedule_created": "New schedules",
      "schedule_created_help": "When a schedule is added to a joined room",
      "schedule_updated": "Schedule changes",
      "schedule_updated_help": "When a joined schedule changes",
      "schedule_cancelled": "Cancelled schedules",
      "schedule_cancelled_help": "When a joined schedule is cancelled",
      "post_like": "Likes",
      "post_like_help": "When likes gather on your post",
      "post_comment": "Comments",
      "post_comment_help": "When someone comments on your post",
      "post_reply": "Replies",
      "post_reply_help": "When someone replies to your comment",
      "post_mention": "Post mentions",
      "post_mention_help": "When someone mentions you in a post or comment"
    }
  },
  "ja": {
    "caption": "プッシュ、アプリ内通知、音",
    "section": {
      "defaults": "基本",
      "types": "種類",
      "push_types": "プッシュ種別",
      "quiet": "通知を控える時間",
      "in_app": "アプリ内通知"
    },
    "field": {
      "push": "プッシュ通知",
      "preview": "プレビュー",
      "sound": "音",
      "vibrate": "バイブレーション",
      "chat": "チャット",
      "system": "お知らせ・システム",
      "marketing": "マーケティング"
    },
    "help": {
      "push": "すべてのプッシュ通知",
      "preview": "ロック画面に内容を表示",
      "chat_push": "チャットメッセージのプッシュ",
      "system_push": "サービス案内と重要なお知らせ",
      "marketing_push": "イベントとプロモーション"
    },
    "in_app": {
      "master": "アプリ内通知",
      "master_help": "アプリ内の通知一覧に表示",
      "group": {
        "social": "ソーシャル",
        "chat": "チャット",
        "beacon": "ビーコン",
        "schedule": "予定",
        "post": "投稿"
      },
      "follow_created": "新しいフォロワー",
      "follow_created_help": "フォローされたとき",
      "chat_reply": "返信",
      "chat_reply_help": "自分のメッセージに返信されたとき",
      "chat_mention": "メンション",
      "chat_mention_help": "自分がメンションされたとき",
      "beacon_join_request": "参加リクエスト",
      "beacon_join_request_help": "ビーコン参加リクエストが届いたとき",
      "beacon_join_approved": "参加承認",
      "beacon_join_approved_help": "ビーコン参加が承認されたとき",
      "beacon_friend_created": "友達のビーコン",
      "beacon_friend_created_help": "友達がビーコンを作成したとき",
      "schedule_created": "新しい予定",
      "schedule_created_help": "参加中のルームに予定が追加されたとき",
      "schedule_updated": "予定変更",
      "schedule_updated_help": "参加中の予定が変更されたとき",
      "schedule_cancelled": "予定キャンセル",
      "schedule_cancelled_help": "参加中の予定がキャンセルされたとき",
      "post_like": "いいね",
      "post_like_help": "自分の投稿にいいねが集まったとき",
      "post_comment": "コメント",
      "post_comment_help": "自分の投稿にコメントされたとき",
      "post_reply": "返信",
      "post_reply_help": "自分のコメントに返信されたとき",
      "post_mention": "投稿メンション",
      "post_mention_help": "投稿やコメントでメンションされたとき"
    }
  },
  "zh-Hans": {
    "caption": "推送、应用内提醒、声音",
    "section": {
      "defaults": "默认",
      "types": "类型",
      "push_types": "推送类型",
      "quiet": "免打扰时间",
      "in_app": "应用内提醒"
    },
    "field": {
      "push": "推送通知",
      "preview": "预览",
      "sound": "声音",
      "vibrate": "振动",
      "chat": "聊天",
      "system": "公告与系统",
      "marketing": "营销"
    },
    "help": {
      "push": "全部推送通知",
      "preview": "在锁屏显示内容",
      "chat_push": "聊天消息推送",
      "system_push": "服务通知和重要公告",
      "marketing_push": "活动和优惠"
    },
    "in_app": {
      "master": "应用内提醒",
      "master_help": "显示在应用通知中心",
      "group": {
        "social": "社交",
        "chat": "聊天",
        "beacon": "Beacon",
        "schedule": "日程",
        "post": "帖子"
      },
      "follow_created": "新关注者",
      "follow_created_help": "有人关注你时",
      "chat_reply": "回复",
      "chat_reply_help": "有人回复你的消息时",
      "chat_mention": "提及",
      "chat_mention_help": "有人提及你时",
      "beacon_join_request": "加入请求",
      "beacon_join_request_help": "收到 Beacon 加入请求时",
      "beacon_join_approved": "加入已批准",
      "beacon_join_approved_help": "Beacon 加入被批准时",
      "beacon_friend_created": "好友 Beacon",
      "beacon_friend_created_help": "好友创建 Beacon 时",
      "schedule_created": "新日程",
      "schedule_created_help": "已加入房间新增日程时",
      "schedule_updated": "日程变更",
      "schedule_updated_help": "已加入日程变更时",
      "schedule_cancelled": "日程取消",
      "schedule_cancelled_help": "已加入日程取消时",
      "post_like": "点赞",
      "post_like_help": "你的帖子收到点赞时",
      "post_comment": "评论",
      "post_comment_help": "有人评论你的帖子时",
      "post_reply": "回复",
      "post_reply_help": "有人回复你的评论时",
      "post_mention": "帖子提及",
      "post_mention_help": "有人在帖子或评论中提及你时"
    }
  },
  "zh-Hant": {
    "caption": "推播、應用內提醒、聲音",
    "section": {
      "defaults": "預設",
      "types": "類型",
      "push_types": "推播類型",
      "quiet": "勿擾時間",
      "in_app": "應用內提醒"
    },
    "field": {
      "push": "推播通知",
      "preview": "預覽",
      "sound": "聲音",
      "vibrate": "震動",
      "chat": "聊天",
      "system": "公告與系統",
      "marketing": "行銷"
    },
    "help": {
      "push": "全部推播通知",
      "preview": "在鎖定畫面顯示內容",
      "chat_push": "聊天訊息推播",
      "system_push": "服務通知與重要公告",
      "marketing_push": "活動與優惠"
    },
    "in_app": {
      "master": "應用內提醒",
      "master_help": "顯示在應用內通知中心",
      "group": {
        "social": "社交",
        "chat": "聊天",
        "beacon": "Beacon",
        "schedule": "行程",
        "post": "貼文"
      },
      "follow_created": "新追蹤者",
      "follow_created_help": "有人追蹤你時",
      "chat_reply": "回覆",
      "chat_reply_help": "有人回覆你的訊息時",
      "chat_mention": "提及",
      "chat_mention_help": "有人提及你時",
      "beacon_join_request": "加入請求",
      "beacon_join_request_help": "收到 Beacon 加入請求時",
      "beacon_join_approved": "加入已核准",
      "beacon_join_approved_help": "Beacon 加入被核准時",
      "beacon_friend_created": "好友 Beacon",
      "beacon_friend_created_help": "好友建立 Beacon 時",
      "schedule_created": "新行程",
      "schedule_created_help": "已加入聊天室新增行程時",
      "schedule_updated": "行程變更",
      "schedule_updated_help": "已加入行程變更時",
      "schedule_cancelled": "行程取消",
      "schedule_cancelled_help": "已加入行程取消時",
      "post_like": "按讚",
      "post_like_help": "你的貼文收到按讚時",
      "post_comment": "留言",
      "post_comment_help": "有人留言你的貼文時",
      "post_reply": "回覆",
      "post_reply_help": "有人回覆你的留言時",
      "post_mention": "貼文提及",
      "post_mention_help": "有人在貼文或留言中提及你時"
    }
  },
  "es": {
    "caption": "Push, avisos en la app y sonido",
    "section": {
      "defaults": "General",
      "types": "Tipos",
      "push_types": "Tipos de push",
      "quiet": "Horas de silencio",
      "in_app": "Avisos en la app"
    },
    "field": {
      "push": "Notificaciones push",
      "preview": "Vista previa",
      "sound": "Sonido",
      "vibrate": "Vibración",
      "chat": "Chat",
      "system": "Avisos y sistema",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Todas las notificaciones push",
      "preview": "Mostrar contenido en la pantalla bloqueada",
      "chat_push": "Push de mensajes de chat",
      "system_push": "Avisos del servicio y novedades clave",
      "marketing_push": "Eventos y promociones"
    },
    "in_app": {
      "master": "Avisos en la app",
      "master_help": "Se muestran en el buzón de la app",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacons",
        "schedule": "Planes",
        "post": "Publicaciones"
      },
      "follow_created": "Nuevo seguidor",
      "follow_created_help": "Cuando alguien te sigue",
      "chat_reply": "Respuestas",
      "chat_reply_help": "Cuando responden a tu mensaje",
      "chat_mention": "Menciones",
      "chat_mention_help": "Cuando te mencionan",
      "beacon_join_request": "Solicitudes de entrada",
      "beacon_join_request_help": "Cuando llega una solicitud para un beacon",
      "beacon_join_approved": "Entrada aprobada",
      "beacon_join_approved_help": "Cuando aprueban tu entrada a un beacon",
      "beacon_friend_created": "Beacons de amigos",
      "beacon_friend_created_help": "Cuando un amigo crea un beacon",
      "schedule_created": "Nuevo plan",
      "schedule_created_help": "Cuando se añade un plan a una sala unida",
      "schedule_updated": "Cambios de plan",
      "schedule_updated_help": "Cuando cambia un plan unido",
      "schedule_cancelled": "Planes cancelados",
      "schedule_cancelled_help": "Cuando se cancela un plan unido",
      "post_like": "Me gusta",
      "post_like_help": "Cuando tu publicación reúne me gusta",
      "post_comment": "Comentarios",
      "post_comment_help": "Cuando comentan tu publicación",
      "post_reply": "Respuestas",
      "post_reply_help": "Cuando responden a tu comentario",
      "post_mention": "Menciones en publicaciones",
      "post_mention_help": "Cuando te mencionan en una publicación o comentario"
    }
  },
  "pt": {
    "caption": "Push, alertas no app e som",
    "section": {
      "defaults": "Padrão",
      "types": "Tipos",
      "push_types": "Tipos de push",
      "quiet": "Horário silencioso",
      "in_app": "Alertas no app"
    },
    "field": {
      "push": "Notificações push",
      "preview": "Prévia",
      "sound": "Som",
      "vibrate": "Vibração",
      "chat": "Chat",
      "system": "Avisos e sistema",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Todas as notificações push",
      "preview": "Mostrar conteúdo na tela bloqueada",
      "chat_push": "Push de mensagens do chat",
      "system_push": "Avisos do serviço e atualizações importantes",
      "marketing_push": "Eventos e promoções"
    },
    "in_app": {
      "master": "Alertas no app",
      "master_help": "Exibidos na central do app",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacons",
        "schedule": "Agenda",
        "post": "Posts"
      },
      "follow_created": "Novo seguidor",
      "follow_created_help": "Quando alguém segue você",
      "chat_reply": "Respostas",
      "chat_reply_help": "Quando respondem à sua mensagem",
      "chat_mention": "Menções",
      "chat_mention_help": "Quando mencionam você",
      "beacon_join_request": "Pedidos de entrada",
      "beacon_join_request_help": "Quando chega um pedido para um beacon",
      "beacon_join_approved": "Entrada aprovada",
      "beacon_join_approved_help": "Quando sua entrada no beacon é aprovada",
      "beacon_friend_created": "Beacons de amigos",
      "beacon_friend_created_help": "Quando um amigo cria um beacon",
      "schedule_created": "Nova agenda",
      "schedule_created_help": "Quando uma agenda é adicionada a uma sala",
      "schedule_updated": "Agenda alterada",
      "schedule_updated_help": "Quando uma agenda em que você participa muda",
      "schedule_cancelled": "Agenda cancelada",
      "schedule_cancelled_help": "Quando uma agenda em que você participa é cancelada",
      "post_like": "Curtidas",
      "post_like_help": "Quando seu post recebe curtidas",
      "post_comment": "Comentários",
      "post_comment_help": "Quando comentam no seu post",
      "post_reply": "Respostas",
      "post_reply_help": "Quando respondem ao seu comentário",
      "post_mention": "Menções em posts",
      "post_mention_help": "Quando mencionam você em um post ou comentário"
    }
  },
  "fr": {
    "caption": "Push, alertes dans l’app, son",
    "section": {
      "defaults": "Par défaut",
      "types": "Types",
      "push_types": "Types de push",
      "quiet": "Heures silencieuses",
      "in_app": "Alertes dans l’app"
    },
    "field": {
      "push": "Notifications push",
      "preview": "Aperçu",
      "sound": "Son",
      "vibrate": "Vibration",
      "chat": "Chat",
      "system": "Annonces et système",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Toutes les notifications push",
      "preview": "Afficher le contenu sur l’écran verrouillé",
      "chat_push": "Push des messages de chat",
      "system_push": "Infos service et annonces importantes",
      "marketing_push": "Événements et promotions"
    },
    "in_app": {
      "master": "Alertes dans l’app",
      "master_help": "Affichées dans la boîte de l’app",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacons",
        "schedule": "Événements",
        "post": "Publications"
      },
      "follow_created": "Nouvel abonné",
      "follow_created_help": "Quand quelqu’un vous suit",
      "chat_reply": "Réponses",
      "chat_reply_help": "Quand quelqu’un répond à votre message",
      "chat_mention": "Mentions",
      "chat_mention_help": "Quand quelqu’un vous mentionne",
      "beacon_join_request": "Demandes d’accès",
      "beacon_join_request_help": "Quand une demande de beacon arrive",
      "beacon_join_approved": "Accès approuvé",
      "beacon_join_approved_help": "Quand votre accès au beacon est approuvé",
      "beacon_friend_created": "Beacons d’amis",
      "beacon_friend_created_help": "Quand un ami crée un beacon",
      "schedule_created": "Nouvel événement",
      "schedule_created_help": "Quand un événement est ajouté à un salon rejoint",
      "schedule_updated": "Événement modifié",
      "schedule_updated_help": "Quand un événement rejoint change",
      "schedule_cancelled": "Événement annulé",
      "schedule_cancelled_help": "Quand un événement rejoint est annulé",
      "post_like": "J’aime",
      "post_like_help": "Quand votre publication reçoit des j’aime",
      "post_comment": "Commentaires",
      "post_comment_help": "Quand quelqu’un commente votre publication",
      "post_reply": "Réponses",
      "post_reply_help": "Quand quelqu’un répond à votre commentaire",
      "post_mention": "Mentions de publication",
      "post_mention_help": "Quand on vous mentionne dans une publication ou un commentaire"
    }
  },
  "de": {
    "caption": "Push, In-App-Hinweise, Ton",
    "section": {
      "defaults": "Standard",
      "types": "Typen",
      "push_types": "Push-Typen",
      "quiet": "Ruhezeiten",
      "in_app": "In-App-Hinweise"
    },
    "field": {
      "push": "Push-Mitteilungen",
      "preview": "Vorschau",
      "sound": "Ton",
      "vibrate": "Vibration",
      "chat": "Chat",
      "system": "Hinweise & System",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Alle Push-Mitteilungen",
      "preview": "Inhalt auf dem Sperrbildschirm anzeigen",
      "chat_push": "Push für Chatnachrichten",
      "system_push": "Servicehinweise und wichtige Updates",
      "marketing_push": "Events und Aktionen"
    },
    "in_app": {
      "master": "In-App-Hinweise",
      "master_help": "Im Benachrichtigungsbereich der App anzeigen",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacons",
        "schedule": "Termine",
        "post": "Beiträge"
      },
      "follow_created": "Neuer Follower",
      "follow_created_help": "Wenn dir jemand folgt",
      "chat_reply": "Antworten",
      "chat_reply_help": "Wenn jemand auf deine Nachricht antwortet",
      "chat_mention": "Erwähnungen",
      "chat_mention_help": "Wenn dich jemand erwähnt",
      "beacon_join_request": "Beitrittsanfragen",
      "beacon_join_request_help": "Wenn eine Beacon-Anfrage eingeht",
      "beacon_join_approved": "Beitritt genehmigt",
      "beacon_join_approved_help": "Wenn dein Beacon-Beitritt genehmigt wird",
      "beacon_friend_created": "Freund-Beacons",
      "beacon_friend_created_help": "Wenn ein Freund einen Beacon erstellt",
      "schedule_created": "Neue Termine",
      "schedule_created_help": "Wenn in einem beigetretenen Raum ein Termin entsteht",
      "schedule_updated": "Terminänderungen",
      "schedule_updated_help": "Wenn sich ein beigetretener Termin ändert",
      "schedule_cancelled": "Abgesagte Termine",
      "schedule_cancelled_help": "Wenn ein beigetretener Termin abgesagt wird",
      "post_like": "Likes",
      "post_like_help": "Wenn dein Beitrag Likes erhält",
      "post_comment": "Kommentare",
      "post_comment_help": "Wenn jemand deinen Beitrag kommentiert",
      "post_reply": "Antworten",
      "post_reply_help": "Wenn jemand auf deinen Kommentar antwortet",
      "post_mention": "Beitragserwähnungen",
      "post_mention_help": "Wenn du in einem Beitrag oder Kommentar erwähnt wirst"
    }
  },
  "id": {
    "caption": "Push, notifikasi app, suara",
    "section": {
      "defaults": "Default",
      "types": "Jenis",
      "push_types": "Jenis push",
      "quiet": "Jam senyap",
      "in_app": "Notifikasi app"
    },
    "field": {
      "push": "Notifikasi push",
      "preview": "Pratinjau",
      "sound": "Suara",
      "vibrate": "Getar",
      "chat": "Chat",
      "system": "Info & sistem",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Semua notifikasi push",
      "preview": "Tampilkan isi di layar kunci",
      "chat_push": "Push pesan chat",
      "system_push": "Info layanan dan pengumuman penting",
      "marketing_push": "Event dan promo"
    },
    "in_app": {
      "master": "Notifikasi app",
      "master_help": "Tampil di kotak notifikasi app",
      "group": {
        "social": "Sosial",
        "chat": "Chat",
        "beacon": "Beacon",
        "schedule": "Jadwal",
        "post": "Postingan"
      },
      "follow_created": "Pengikut baru",
      "follow_created_help": "Saat seseorang mengikuti Anda",
      "chat_reply": "Balasan",
      "chat_reply_help": "Saat pesan Anda dibalas",
      "chat_mention": "Mention",
      "chat_mention_help": "Saat Anda disebut",
      "beacon_join_request": "Permintaan gabung",
      "beacon_join_request_help": "Saat ada permintaan gabung beacon",
      "beacon_join_approved": "Gabung disetujui",
      "beacon_join_approved_help": "Saat gabung beacon Anda disetujui",
      "beacon_friend_created": "Beacon teman",
      "beacon_friend_created_help": "Saat teman membuat beacon",
      "schedule_created": "Jadwal baru",
      "schedule_created_help": "Saat jadwal ditambahkan di room yang diikuti",
      "schedule_updated": "Jadwal berubah",
      "schedule_updated_help": "Saat jadwal yang diikuti berubah",
      "schedule_cancelled": "Jadwal batal",
      "schedule_cancelled_help": "Saat jadwal yang diikuti dibatalkan",
      "post_like": "Suka",
      "post_like_help": "Saat postingan Anda mendapat suka",
      "post_comment": "Komentar",
      "post_comment_help": "Saat postingan Anda dikomentari",
      "post_reply": "Balasan",
      "post_reply_help": "Saat komentar Anda dibalas",
      "post_mention": "Mention postingan",
      "post_mention_help": "Saat Anda disebut di postingan atau komentar"
    }
  },
  "hi": {
    "caption": "पुश, इन-ऐप अलर्ट, ध्वनि",
    "section": {
      "defaults": "डिफ़ॉल्ट",
      "types": "प्रकार",
      "push_types": "पुश प्रकार",
      "quiet": "शांत समय",
      "in_app": "इन-ऐप अलर्ट"
    },
    "field": {
      "push": "पुश सूचनाएँ",
      "preview": "पूर्वावलोकन",
      "sound": "ध्वनि",
      "vibrate": "वाइब्रेशन",
      "chat": "चैट",
      "system": "सूचना व सिस्टम",
      "marketing": "मार्केटिंग"
    },
    "help": {
      "push": "सभी पुश सूचनाएँ",
      "preview": "लॉक स्क्रीन पर सामग्री दिखाएँ",
      "chat_push": "चैट संदेश पुश",
      "system_push": "सेवा सूचना और प्रमुख अपडेट",
      "marketing_push": "इवेंट और प्रमोशन"
    },
    "in_app": {
      "master": "इन-ऐप अलर्ट",
      "master_help": "ऐप के नोटिफिकेशन बॉक्स में दिखाएँ",
      "group": {
        "social": "सोशल",
        "chat": "चैट",
        "beacon": "बीकन",
        "schedule": "शेड्यूल",
        "post": "पोस्ट"
      },
      "follow_created": "नया फ़ॉलोअर",
      "follow_created_help": "जब कोई आपको फ़ॉलो करे",
      "chat_reply": "जवाब",
      "chat_reply_help": "जब कोई आपके संदेश का जवाब दे",
      "chat_mention": "मेंशन",
      "chat_mention_help": "जब कोई आपको मेंशन करे",
      "beacon_join_request": "जॉइन अनुरोध",
      "beacon_join_request_help": "जब बीकन जॉइन अनुरोध आए",
      "beacon_join_approved": "जॉइन स्वीकृत",
      "beacon_join_approved_help": "जब आपका बीकन जॉइन स्वीकृत हो",
      "beacon_friend_created": "दोस्त के बीकन",
      "beacon_friend_created_help": "जब दोस्त बीकन बनाए",
      "schedule_created": "नया शेड्यूल",
      "schedule_created_help": "जब जुड़ी हुई रूम में शेड्यूल जोड़ा जाए",
      "schedule_updated": "शेड्यूल बदला",
      "schedule_updated_help": "जब आपका जुड़ा शेड्यूल बदले",
      "schedule_cancelled": "शेड्यूल रद्द",
      "schedule_cancelled_help": "जब आपका जुड़ा शेड्यूल रद्द हो",
      "post_like": "लाइक",
      "post_like_help": "जब आपकी पोस्ट पर लाइक आएँ",
      "post_comment": "टिप्पणियाँ",
      "post_comment_help": "जब कोई आपकी पोस्ट पर टिप्पणी करे",
      "post_reply": "जवाब",
      "post_reply_help": "जब कोई आपकी टिप्पणी का जवाब दे",
      "post_mention": "पोस्ट मेंशन",
      "post_mention_help": "जब कोई पोस्ट या टिप्पणी में आपको मेंशन करे"
    }
  },
  "ru": {
    "caption": "Push, уведомления в приложении, звук",
    "section": {
      "defaults": "Основное",
      "types": "Типы",
      "push_types": "Типы push",
      "quiet": "Тихие часы",
      "in_app": "Уведомления в приложении"
    },
    "field": {
      "push": "Push-уведомления",
      "preview": "Предпросмотр",
      "sound": "Звук",
      "vibrate": "Вибрация",
      "chat": "Чат",
      "system": "Сервис и система",
      "marketing": "Маркетинг"
    },
    "help": {
      "push": "Все push-уведомления",
      "preview": "Показывать текст на экране блокировки",
      "chat_push": "Push для сообщений чата",
      "system_push": "Сервисные сообщения и важные новости",
      "marketing_push": "События и акции"
    },
    "in_app": {
      "master": "Уведомления в приложении",
      "master_help": "Показывать в центре уведомлений приложения",
      "group": {
        "social": "Социальное",
        "chat": "Чат",
        "beacon": "Биконы",
        "schedule": "Расписания",
        "post": "Посты"
      },
      "follow_created": "Новый подписчик",
      "follow_created_help": "Когда кто-то подписался на вас",
      "chat_reply": "Ответы",
      "chat_reply_help": "Когда отвечают на ваше сообщение",
      "chat_mention": "Упоминания",
      "chat_mention_help": "Когда вас упоминают",
      "beacon_join_request": "Запросы на вход",
      "beacon_join_request_help": "Когда приходит запрос на вход в beacon",
      "beacon_join_approved": "Вход одобрен",
      "beacon_join_approved_help": "Когда ваш вход в beacon одобрен",
      "beacon_friend_created": "Биконы друзей",
      "beacon_friend_created_help": "Когда друг создаёт beacon",
      "schedule_created": "Новое событие",
      "schedule_created_help": "Когда событие добавлено в комнату",
      "schedule_updated": "Изменения событий",
      "schedule_updated_help": "Когда изменилось событие, где вы участвуете",
      "schedule_cancelled": "Отменённые события",
      "schedule_cancelled_help": "Когда событие, где вы участвуете, отменено",
      "post_like": "Лайки",
      "post_like_help": "Когда ваш пост получает лайки",
      "post_comment": "Комментарии",
      "post_comment_help": "Когда комментируют ваш пост",
      "post_reply": "Ответы",
      "post_reply_help": "Когда отвечают на ваш комментарий",
      "post_mention": "Упоминания в постах",
      "post_mention_help": "Когда вас упоминают в посте или комментарии"
    }
  },
  "ar": {
    "caption": "إشعارات فورية، داخل التطبيق، وصوت",
    "section": {
      "defaults": "الافتراضي",
      "types": "الأنواع",
      "push_types": "أنواع الإشعارات الفورية",
      "quiet": "ساعات الهدوء",
      "in_app": "تنبيهات داخل التطبيق"
    },
    "field": {
      "push": "الإشعارات الفورية",
      "preview": "المعاينة",
      "sound": "الصوت",
      "vibrate": "الاهتزاز",
      "chat": "الدردشة",
      "system": "الإعلانات والنظام",
      "marketing": "التسويق"
    },
    "help": {
      "push": "كل الإشعارات الفورية",
      "preview": "عرض المحتوى على شاشة القفل",
      "chat_push": "إشعارات رسائل الدردشة",
      "system_push": "تنبيهات الخدمة والتحديثات المهمة",
      "marketing_push": "الفعاليات والعروض"
    },
    "in_app": {
      "master": "تنبيهات داخل التطبيق",
      "master_help": "تظهر في صندوق تنبيهات التطبيق",
      "group": {
        "social": "اجتماعي",
        "chat": "الدردشة",
        "beacon": "Beacon",
        "schedule": "المواعيد",
        "post": "المنشورات"
      },
      "follow_created": "متابع جديد",
      "follow_created_help": "عندما يتابعك شخص ما",
      "chat_reply": "الردود",
      "chat_reply_help": "عندما يرد شخص على رسالتك",
      "chat_mention": "الإشارات",
      "chat_mention_help": "عندما يذكرك شخص ما",
      "beacon_join_request": "طلبات الانضمام",
      "beacon_join_request_help": "عند وصول طلب انضمام إلى Beacon",
      "beacon_join_approved": "تمت الموافقة",
      "beacon_join_approved_help": "عند الموافقة على انضمامك إلى Beacon",
      "beacon_friend_created": "Beacon من الأصدقاء",
      "beacon_friend_created_help": "عندما ينشئ صديق Beacon",
      "schedule_created": "موعد جديد",
      "schedule_created_help": "عند إضافة موعد إلى غرفة منضم إليها",
      "schedule_updated": "تغيير موعد",
      "schedule_updated_help": "عند تغيير موعد منضم إليه",
      "schedule_cancelled": "موعد ملغى",
      "schedule_cancelled_help": "عند إلغاء موعد منضم إليه",
      "post_like": "الإعجابات",
      "post_like_help": "عندما يحصل منشورك على إعجابات",
      "post_comment": "التعليقات",
      "post_comment_help": "عندما يعلق شخص على منشورك",
      "post_reply": "الردود",
      "post_reply_help": "عندما يرد شخص على تعليقك",
      "post_mention": "إشارات المنشورات",
      "post_mention_help": "عندما يذكرك شخص في منشور أو تعليق"
    }
  },
  "vi": {
    "caption": "Push, thông báo trong app, âm thanh",
    "section": {
      "defaults": "Mặc định",
      "types": "Loại",
      "push_types": "Loại push",
      "quiet": "Giờ yên lặng",
      "in_app": "Thông báo trong app"
    },
    "field": {
      "push": "Thông báo push",
      "preview": "Xem trước",
      "sound": "Âm thanh",
      "vibrate": "Rung",
      "chat": "Chat",
      "system": "Thông báo & hệ thống",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Tất cả thông báo push",
      "preview": "Hiển thị nội dung trên màn hình khóa",
      "chat_push": "Push tin nhắn chat",
      "system_push": "Thông báo dịch vụ và cập nhật quan trọng",
      "marketing_push": "Sự kiện và khuyến mãi"
    },
    "in_app": {
      "master": "Thông báo trong app",
      "master_help": "Hiển thị trong hộp thông báo của app",
      "group": {
        "social": "Xã hội",
        "chat": "Chat",
        "beacon": "Beacon",
        "schedule": "Lịch",
        "post": "Bài viết"
      },
      "follow_created": "Người theo dõi mới",
      "follow_created_help": "Khi có người theo dõi bạn",
      "chat_reply": "Trả lời",
      "chat_reply_help": "Khi có người trả lời tin nhắn của bạn",
      "chat_mention": "Nhắc đến",
      "chat_mention_help": "Khi có người nhắc đến bạn",
      "beacon_join_request": "Yêu cầu tham gia",
      "beacon_join_request_help": "Khi có yêu cầu tham gia beacon",
      "beacon_join_approved": "Đã duyệt tham gia",
      "beacon_join_approved_help": "Khi yêu cầu tham gia beacon được duyệt",
      "beacon_friend_created": "Beacon của bạn bè",
      "beacon_friend_created_help": "Khi bạn bè tạo beacon",
      "schedule_created": "Lịch mới",
      "schedule_created_help": "Khi lịch được thêm vào phòng đã tham gia",
      "schedule_updated": "Lịch thay đổi",
      "schedule_updated_help": "Khi lịch bạn tham gia thay đổi",
      "schedule_cancelled": "Lịch bị hủy",
      "schedule_cancelled_help": "Khi lịch bạn tham gia bị hủy",
      "post_like": "Lượt thích",
      "post_like_help": "Khi bài viết của bạn nhận lượt thích",
      "post_comment": "Bình luận",
      "post_comment_help": "Khi có người bình luận bài viết của bạn",
      "post_reply": "Trả lời",
      "post_reply_help": "Khi có người trả lời bình luận của bạn",
      "post_mention": "Nhắc trong bài viết",
      "post_mention_help": "Khi có người nhắc bạn trong bài viết hoặc bình luận"
    }
  },
  "tr": {
    "caption": "Push, uygulama içi uyarılar, ses",
    "section": {
      "defaults": "Varsayılan",
      "types": "Türler",
      "push_types": "Push türleri",
      "quiet": "Sessiz saatler",
      "in_app": "Uygulama içi uyarılar"
    },
    "field": {
      "push": "Push bildirimleri",
      "preview": "Önizleme",
      "sound": "Ses",
      "vibrate": "Titreşim",
      "chat": "Sohbet",
      "system": "Duyuru ve sistem",
      "marketing": "Pazarlama"
    },
    "help": {
      "push": "Tüm push bildirimleri",
      "preview": "Kilit ekranında içeriği göster",
      "chat_push": "Sohbet mesajı push’u",
      "system_push": "Servis duyuruları ve önemli güncellemeler",
      "marketing_push": "Etkinlikler ve promosyonlar"
    },
    "in_app": {
      "master": "Uygulama içi uyarılar",
      "master_help": "Uygulama bildirim kutusunda göster",
      "group": {
        "social": "Sosyal",
        "chat": "Sohbet",
        "beacon": "Beacon",
        "schedule": "Planlar",
        "post": "Gönderiler"
      },
      "follow_created": "Yeni takipçi",
      "follow_created_help": "Biri sizi takip ettiğinde",
      "chat_reply": "Yanıtlar",
      "chat_reply_help": "Mesajınıza yanıt verildiğinde",
      "chat_mention": "Bahsetmeler",
      "chat_mention_help": "Biri sizden bahsettiğinde",
      "beacon_join_request": "Katılma istekleri",
      "beacon_join_request_help": "Beacon katılma isteği geldiğinde",
      "beacon_join_approved": "Katılım onaylandı",
      "beacon_join_approved_help": "Beacon katılımınız onaylandığında",
      "beacon_friend_created": "Arkadaş beacon’ları",
      "beacon_friend_created_help": "Bir arkadaş beacon oluşturduğunda",
      "schedule_created": "Yeni plan",
      "schedule_created_help": "Katıldığınız odaya plan eklendiğinde",
      "schedule_updated": "Plan değişiklikleri",
      "schedule_updated_help": "Katıldığınız plan değiştiğinde",
      "schedule_cancelled": "İptal edilen planlar",
      "schedule_cancelled_help": "Katıldığınız plan iptal edildiğinde",
      "post_like": "Beğeniler",
      "post_like_help": "Gönderiniz beğeni aldığında",
      "post_comment": "Yorumlar",
      "post_comment_help": "Gönderinize yorum yapıldığında",
      "post_reply": "Yanıtlar",
      "post_reply_help": "Yorumunuza yanıt verildiğinde",
      "post_mention": "Gönderi bahsetmeleri",
      "post_mention_help": "Gönderi veya yorumda sizden bahsedildiğinde"
    }
  },
  "th": {
    "caption": "พุช, แจ้งเตือนในแอป, เสียง",
    "section": {
      "defaults": "ค่าเริ่มต้น",
      "types": "ประเภท",
      "push_types": "ประเภทพุช",
      "quiet": "เวลาปิดเสียง",
      "in_app": "แจ้งเตือนในแอป"
    },
    "field": {
      "push": "การแจ้งเตือนพุช",
      "preview": "ตัวอย่าง",
      "sound": "เสียง",
      "vibrate": "สั่น",
      "chat": "แชต",
      "system": "ประกาศและระบบ",
      "marketing": "การตลาด"
    },
    "help": {
      "push": "การแจ้งเตือนพุชทั้งหมด",
      "preview": "แสดงเนื้อหาบนหน้าจอล็อก",
      "chat_push": "พุชข้อความแชต",
      "system_push": "ประกาศบริการและอัปเดตสำคัญ",
      "marketing_push": "กิจกรรมและโปรโมชัน"
    },
    "in_app": {
      "master": "แจ้งเตือนในแอป",
      "master_help": "แสดงในกล่องแจ้งเตือนของแอป",
      "group": {
        "social": "โซเชียล",
        "chat": "แชต",
        "beacon": "Beacon",
        "schedule": "กำหนดการ",
        "post": "โพสต์"
      },
      "follow_created": "ผู้ติดตามใหม่",
      "follow_created_help": "เมื่อมีคนติดตามคุณ",
      "chat_reply": "ตอบกลับ",
      "chat_reply_help": "เมื่อมีคนตอบกลับข้อความของคุณ",
      "chat_mention": "กล่าวถึง",
      "chat_mention_help": "เมื่อมีคนกล่าวถึงคุณ",
      "beacon_join_request": "คำขอเข้าร่วม",
      "beacon_join_request_help": "เมื่อมีคำขอเข้าร่วม Beacon",
      "beacon_join_approved": "อนุมัติการเข้าร่วม",
      "beacon_join_approved_help": "เมื่อการเข้าร่วม Beacon ได้รับอนุมัติ",
      "beacon_friend_created": "Beacon จากเพื่อน",
      "beacon_friend_created_help": "เมื่อเพื่อนสร้าง Beacon",
      "schedule_created": "กำหนดการใหม่",
      "schedule_created_help": "เมื่อมีการเพิ่มกำหนดการในห้องที่เข้าร่วม",
      "schedule_updated": "เปลี่ยนกำหนดการ",
      "schedule_updated_help": "เมื่อกำหนดการที่เข้าร่วมมีการเปลี่ยนแปลง",
      "schedule_cancelled": "ยกเลิกกำหนดการ",
      "schedule_cancelled_help": "เมื่อกำหนดการที่เข้าร่วมถูกยกเลิก",
      "post_like": "ถูกใจ",
      "post_like_help": "เมื่อโพสต์ของคุณได้รับการถูกใจ",
      "post_comment": "ความคิดเห็น",
      "post_comment_help": "เมื่อมีคนแสดงความคิดเห็นในโพสต์ของคุณ",
      "post_reply": "ตอบกลับ",
      "post_reply_help": "เมื่อมีคนตอบกลับความคิดเห็นของคุณ",
      "post_mention": "กล่าวถึงในโพสต์",
      "post_mention_help": "เมื่อมีคนกล่าวถึงคุณในโพสต์หรือความคิดเห็น"
    }
  },
  "it": {
    "caption": "Push, avvisi in-app, suono",
    "section": {
      "defaults": "Predefinite",
      "types": "Tipi",
      "push_types": "Tipi push",
      "quiet": "Ore silenziose",
      "in_app": "Avvisi in-app"
    },
    "field": {
      "push": "Notifiche push",
      "preview": "Anteprima",
      "sound": "Suono",
      "vibrate": "Vibrazione",
      "chat": "Chat",
      "system": "Avvisi e sistema",
      "marketing": "Marketing"
    },
    "help": {
      "push": "Tutte le notifiche push",
      "preview": "Mostra il contenuto nella schermata di blocco",
      "chat_push": "Push dei messaggi chat",
      "system_push": "Avvisi di servizio e aggiornamenti importanti",
      "marketing_push": "Eventi e promozioni"
    },
    "in_app": {
      "master": "Avvisi in-app",
      "master_help": "Mostrati nella casella notifiche dell’app",
      "group": {
        "social": "Social",
        "chat": "Chat",
        "beacon": "Beacon",
        "schedule": "Programmi",
        "post": "Post"
      },
      "follow_created": "Nuovo follower",
      "follow_created_help": "Quando qualcuno ti segue",
      "chat_reply": "Risposte",
      "chat_reply_help": "Quando qualcuno risponde al tuo messaggio",
      "chat_mention": "Menzioni",
      "chat_mention_help": "Quando qualcuno ti menziona",
      "beacon_join_request": "Richieste di accesso",
      "beacon_join_request_help": "Quando arriva una richiesta per un beacon",
      "beacon_join_approved": "Accesso approvato",
      "beacon_join_approved_help": "Quando il tuo accesso al beacon è approvato",
      "beacon_friend_created": "Beacon degli amici",
      "beacon_friend_created_help": "Quando un amico crea un beacon",
      "schedule_created": "Nuovo programma",
      "schedule_created_help": "Quando viene aggiunto un programma a una stanza",
      "schedule_updated": "Programma modificato",
      "schedule_updated_help": "Quando cambia un programma a cui partecipi",
      "schedule_cancelled": "Programma annullato",
      "schedule_cancelled_help": "Quando viene annullato un programma a cui partecipi",
      "post_like": "Mi piace",
      "post_like_help": "Quando il tuo post riceve mi piace",
      "post_comment": "Commenti",
      "post_comment_help": "Quando qualcuno commenta il tuo post",
      "post_reply": "Risposte",
      "post_reply_help": "Quando qualcuno risponde al tuo commento",
      "post_mention": "Menzioni nei post",
      "post_mention_help": "Quando ti menzionano in un post o commento"
    }
  }
};

const localeOrder = [
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'th',
  'tr',
  'vi',
  'zh-Hans',
  'zh-Hant',
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function removeLegacyKeys(settings) {
  if (settings.notification && settings.notification.field) {
    delete settings.notification.field.friend_request;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const root = process.cwd();
const changed = [];
const missing = [];

for (const lang of localeOrder) {
  const filePath = path.join(root, 'src', 'locales', lang, 'settings.json');
  const patch = LOCALE_PATCHES[lang];

  if (!patch) {
    missing.push(`${lang}: no patch data`);
    continue;
  }

  if (!fs.existsSync(filePath)) {
    missing.push(`${lang}: ${path.relative(root, filePath)} not found`);
    continue;
  }

  const settings = readJson(filePath);
  settings.notification = isPlainObject(settings.notification) ? settings.notification : {};

  mergeDeep(settings.notification, patch);
  removeLegacyKeys(settings);

  writeJson(filePath, settings);
  changed.push(path.relative(root, filePath));
}

console.log('[settings notification i18n] changed files:');
for (const file of changed) {
  console.log(`- ${file}`);
}

if (missing.length > 0) {
  console.warn('[settings notification i18n] skipped:');
  for (const item of missing) {
    console.warn(`- ${item}`);
  }
}

console.log('[settings notification i18n] done');
