#!/usr/bin/env node
/**
 * CO·ONN chat list leave-confirm i18n patch
 *
 * Expected project layout:
 *   C:\dalo-app\patch-chat-list-leave-confirm-i18n.cjs
 *   C:\dalo-app\src\locales\ko\chat.json
 *
 * Usage:
 *   cd C:\dalo-app
 *   node .\patch-chat-list-leave-confirm-i18n.cjs --dry-run
 *   node .\patch-chat-list-leave-confirm-i18n.cjs
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const LOCALES_ROOT = path.join(PROJECT_ROOT, 'src', 'locales');
const DRY_RUN = process.argv.includes('--dry-run');

const PATCH = {
  ar: {
    cancel: 'إلغاء',
    list: {
      leaveConfirmTitle: 'مغادرة المحادثة؟',
      leaveConfirmMessage: 'ستختفي هذه المحادثة من قائمتك.',
      leaveConfirmAction: 'مغادرة',
    },
  },
  de: {
    cancel: 'Abbrechen',
    list: {
      leaveConfirmTitle: 'Chat verlassen?',
      leaveConfirmMessage: 'Dieser Chat wird aus deiner Liste entfernt.',
      leaveConfirmAction: 'Verlassen',
    },
  },
  en: {
    cancel: 'Cancel',
    list: {
      leaveConfirmTitle: 'Leave chat?',
      leaveConfirmMessage: 'This chat will disappear from your list.',
      leaveConfirmAction: 'Leave',
    },
  },
  es: {
    cancel: 'Cancelar',
    list: {
      leaveConfirmTitle: '¿Salir del chat?',
      leaveConfirmMessage: 'Este chat desaparecerá de tu lista.',
      leaveConfirmAction: 'Salir',
    },
  },
  fr: {
    cancel: 'Annuler',
    list: {
      leaveConfirmTitle: 'Quitter le chat ?',
      leaveConfirmMessage: 'Ce chat disparaîtra de votre liste.',
      leaveConfirmAction: 'Quitter',
    },
  },
  hi: {
    cancel: 'रद्द करें',
    list: {
      leaveConfirmTitle: 'चैट छोड़ें?',
      leaveConfirmMessage: 'यह चैट आपकी सूची से हट जाएगी.',
      leaveConfirmAction: 'छोड़ें',
    },
  },
  id: {
    cancel: 'Batal',
    list: {
      leaveConfirmTitle: 'Keluar dari chat?',
      leaveConfirmMessage: 'Chat ini akan hilang dari daftar Anda.',
      leaveConfirmAction: 'Keluar',
    },
  },
  it: {
    cancel: 'Annulla',
    list: {
      leaveConfirmTitle: 'Uscire dalla chat?',
      leaveConfirmMessage: 'Questa chat sparirà dalla tua lista.',
      leaveConfirmAction: 'Esci',
    },
  },
  ja: {
    cancel: 'キャンセル',
    list: {
      leaveConfirmTitle: 'チャットを退出しますか？',
      leaveConfirmMessage: 'このチャットは一覧から消えます。',
      leaveConfirmAction: '退出',
    },
  },
  ko: {
    cancel: '취소',
    list: {
      leaveConfirmTitle: '채팅방에서 나가시겠어요?',
      leaveConfirmMessage: '나가면 이 채팅방이 목록에서 사라집니다.',
      leaveConfirmAction: '나가기',
    },
  },
  pt: {
    cancel: 'Cancelar',
    list: {
      leaveConfirmTitle: 'Sair do chat?',
      leaveConfirmMessage: 'Este chat desaparecerá da sua lista.',
      leaveConfirmAction: 'Sair',
    },
  },
  ru: {
    cancel: 'Отмена',
    list: {
      leaveConfirmTitle: 'Выйти из чата?',
      leaveConfirmMessage: 'Этот чат исчезнет из вашего списка.',
      leaveConfirmAction: 'Выйти',
    },
  },
  th: {
    cancel: 'ยกเลิก',
    list: {
      leaveConfirmTitle: 'ออกจากแชท?',
      leaveConfirmMessage: 'แชทนี้จะหายไปจากรายการของคุณ',
      leaveConfirmAction: 'ออก',
    },
  },
  tr: {
    cancel: 'İptal',
    list: {
      leaveConfirmTitle: 'Sohbetten çıkılsın mı?',
      leaveConfirmMessage: 'Bu sohbet listenizden kaybolur.',
      leaveConfirmAction: 'Çık',
    },
  },
  vi: {
    cancel: 'Hủy',
    list: {
      leaveConfirmTitle: 'Rời cuộc trò chuyện?',
      leaveConfirmMessage: 'Cuộc trò chuyện này sẽ biến mất khỏi danh sách.',
      leaveConfirmAction: 'Rời',
    },
  },
  'zh-Hans': {
    cancel: '取消',
    list: {
      leaveConfirmTitle: '离开聊天？',
      leaveConfirmMessage: '此聊天将从列表中消失。',
      leaveConfirmAction: '离开',
    },
  },
  'zh-Hant': {
    cancel: '取消',
    list: {
      leaveConfirmTitle: '離開聊天？',
      leaveConfirmMessage: '此聊天將從列表中消失。',
      leaveConfirmAction: '離開',
    },
  },
};

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  const output = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(filePath, output, 'utf8');
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function patchLocale(locale) {
  const filePath = path.join(LOCALES_ROOT, locale, 'chat.json');
  if (!fs.existsSync(filePath)) {
    return { locale, status: 'missing', filePath };
  }

  const json = readJson(filePath);
  const patch = PATCH[locale];

  const before = JSON.stringify({
    cancel: json.cancel,
    list: {
      leaveConfirmTitle: json.list && json.list.leaveConfirmTitle,
      leaveConfirmMessage: json.list && json.list.leaveConfirmMessage,
      leaveConfirmAction: json.list && json.list.leaveConfirmAction,
    },
  });

  json.cancel = patch.cancel;
  json.list = ensureObject(json.list);
  json.list.leaveConfirmTitle = patch.list.leaveConfirmTitle;
  json.list.leaveConfirmMessage = patch.list.leaveConfirmMessage;
  json.list.leaveConfirmAction = patch.list.leaveConfirmAction;

  const after = JSON.stringify({
    cancel: json.cancel,
    list: {
      leaveConfirmTitle: json.list.leaveConfirmTitle,
      leaveConfirmMessage: json.list.leaveConfirmMessage,
      leaveConfirmAction: json.list.leaveConfirmAction,
    },
  });

  const changed = before !== after;

  if (changed && !DRY_RUN) {
    writeJson(filePath, json);
  }

  return {
    locale,
    status: changed ? (DRY_RUN ? 'would update' : 'updated') : 'already ok',
    filePath,
  };
}

function verifyLocale(locale) {
  const filePath = path.join(LOCALES_ROOT, locale, 'chat.json');
  const json = readJson(filePath);

  const required = [
    ['cancel', json.cancel],
    ['list.leaveConfirmTitle', json.list && json.list.leaveConfirmTitle],
    ['list.leaveConfirmMessage', json.list && json.list.leaveConfirmMessage],
    ['list.leaveConfirmAction', json.list && json.list.leaveConfirmAction],
  ];

  for (const [key, value] of required) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`[fail] ${locale}: missing ${key}`);
    }
  }

  return true;
}

function main() {
  if (!fs.existsSync(LOCALES_ROOT)) {
    console.error(`[fail] locales root not found: ${LOCALES_ROOT}`);
    process.exit(1);
  }

  const locales = Object.keys(PATCH);
  let missingCount = 0;

  console.log(DRY_RUN ? '[dry-run] chat list leave-confirm i18n patch' : '[apply] chat list leave-confirm i18n patch');
  console.log(`[root] ${PROJECT_ROOT}`);
  console.log(`[locales] ${LOCALES_ROOT}`);

  for (const locale of locales) {
    const result = patchLocale(locale);
    if (result.status === 'missing') {
      missingCount += 1;
      console.log(`[missing] ${locale}: ${result.filePath}`);
    } else {
      console.log(`[${result.status}] ${locale}`);
    }
  }

  if (!DRY_RUN) {
    for (const locale of locales) {
      const filePath = path.join(LOCALES_ROOT, locale, 'chat.json');
      if (fs.existsSync(filePath)) {
        verifyLocale(locale);
      }
    }
    console.log('[ok] chat leave confirm i18n verified');
  }

  if (missingCount > 0) {
    console.log(`[warn] missing locale files: ${missingCount}`);
  }
}

main();
