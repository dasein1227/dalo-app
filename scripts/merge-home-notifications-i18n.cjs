// scripts/merge-home-notifications-i18n.cjs
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const LOCALES = [
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

const PATCHES = {
  ko: {
    notifications: {
      sections: {
        today: '오늘',
        thisWeek: '이번 주',
        older: '이전',
      },
      error: {
        load_failed: '알림을 불러오지 못했습니다.',
      },
      loading_short: '…',
    },
  },
  en: {
    notifications: {
      sections: {
        today: 'Today',
        thisWeek: 'This week',
        older: 'Earlier',
      },
      error: {
        load_failed: 'Couldn’t load notifications.',
      },
      loading_short: '…',
    },
  },
  ja: {
    notifications: {
      sections: {
        today: '今日',
        thisWeek: '今週',
        older: '以前',
      },
      error: {
        load_failed: '通知を読み込めませんでした。',
      },
      loading_short: '…',
    },
  },
  'zh-Hans': {
    notifications: {
      sections: {
        today: '今天',
        thisWeek: '本周',
        older: '更早',
      },
      error: {
        load_failed: '无法加载通知。',
      },
      loading_short: '…',
    },
  },
  'zh-Hant': {
    notifications: {
      sections: {
        today: '今天',
        thisWeek: '本週',
        older: '較早',
      },
      error: {
        load_failed: '無法載入通知。',
      },
      loading_short: '…',
    },
  },
  de: {
    notifications: {
      sections: {
        today: 'Heute',
        thisWeek: 'Diese Woche',
        older: 'Früher',
      },
      error: {
        load_failed: 'Benachrichtigungen konnten nicht geladen werden.',
      },
      loading_short: '…',
    },
  },
  es: {
    notifications: {
      sections: {
        today: 'Hoy',
        thisWeek: 'Esta semana',
        older: 'Antes',
      },
      error: {
        load_failed: 'No se pudieron cargar las notificaciones.',
      },
      loading_short: '…',
    },
  },
  fr: {
    notifications: {
      sections: {
        today: 'Aujourd’hui',
        thisWeek: 'Cette semaine',
        older: 'Avant',
      },
      error: {
        load_failed: 'Impossible de charger les notifications.',
      },
      loading_short: '…',
    },
  },
  hi: {
    notifications: {
      sections: {
        today: 'आज',
        thisWeek: 'इस सप्ताह',
        older: 'पहले',
      },
      error: {
        load_failed: 'सूचनाएँ लोड नहीं हो सकीं।',
      },
      loading_short: '…',
    },
  },
  id: {
    notifications: {
      sections: {
        today: 'Hari ini',
        thisWeek: 'Minggu ini',
        older: 'Sebelumnya',
      },
      error: {
        load_failed: 'Notifikasi tidak dapat dimuat.',
      },
      loading_short: '…',
    },
  },
  it: {
    notifications: {
      sections: {
        today: 'Oggi',
        thisWeek: 'Questa settimana',
        older: 'Prima',
      },
      error: {
        load_failed: 'Impossibile caricare le notifiche.',
      },
      loading_short: '…',
    },
  },
  pt: {
    notifications: {
      sections: {
        today: 'Hoje',
        thisWeek: 'Esta semana',
        older: 'Antes',
      },
      error: {
        load_failed: 'Não foi possível carregar as notificações.',
      },
      loading_short: '…',
    },
  },
  ru: {
    notifications: {
      sections: {
        today: 'Сегодня',
        thisWeek: 'На этой неделе',
        older: 'Ранее',
      },
      error: {
        load_failed: 'Не удалось загрузить уведомления.',
      },
      loading_short: '…',
    },
  },
  th: {
    notifications: {
      sections: {
        today: 'วันนี้',
        thisWeek: 'สัปดาห์นี้',
        older: 'ก่อนหน้านี้',
      },
      error: {
        load_failed: 'โหลดการแจ้งเตือนไม่สำเร็จ',
      },
      loading_short: '…',
    },
  },
  tr: {
    notifications: {
      sections: {
        today: 'Bugün',
        thisWeek: 'Bu hafta',
        older: 'Önceki',
      },
      error: {
        load_failed: 'Bildirimler yüklenemedi.',
      },
      loading_short: '…',
    },
  },
  vi: {
    notifications: {
      sections: {
        today: 'Hôm nay',
        thisWeek: 'Tuần này',
        older: 'Trước đó',
      },
      error: {
        load_failed: 'Không thể tải thông báo.',
      },
      loading_short: '…',
    },
  },
  ar: {
    notifications: {
      sections: {
        today: 'اليوم',
        thisWeek: 'هذا الأسبوع',
        older: 'سابقًا',
      },
      error: {
        load_failed: 'تعذر تحميل الإشعارات.',
      },
      loading_short: '…',
    },
  },
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(target, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (isObject(value)) {
      if (!isObject(target[key])) target[key] = {};
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

const root = process.cwd();
let changed = 0;

LOCALES.forEach((lang) => {
  const file = path.join(root, 'src', 'locales', lang, 'home.json');
  if (!fs.existsSync(file)) {
    console.warn(`[home notifications i18n] skip missing: ${file}`);
    return;
  }

  const source = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(source);
  mergeDeep(json, PATCHES[lang] || PATCHES.en);
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  changed += 1;
});

console.log(`[home notifications i18n] updated ${changed} files`);
