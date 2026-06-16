/*
 * CO·ONN chat room card preview i18n patch
 *
 * Usage from project root:
 *   node scripts/patch-chat-roomcard-preview-i18n.cjs
 *
 * What it patches:
 *   src/locales/<lang>/chat.json              -> roomCard.preview.*
 *   src/locales/<lang>.json, if present       -> chat.roomCard.preview.*  (legacy bundle compatibility)
 */

const fs = require('fs');
const path = require('path');

const PREVIEW_TRANSLATIONS = {
  ar: {
    image: '[صورة]',
    video: '[فيديو]',
    audio: '[صوت]',
    file: '[ملف]',
    map: '[موقع]',
    notice: '[إشعار]',
  },
  de: {
    image: '[Foto]',
    video: '[Video]',
    audio: '[Audio]',
    file: '[Datei]',
    map: '[Standort]',
    notice: '[Hinweis]',
  },
  en: {
    image: '[Photo]',
    video: '[Video]',
    audio: '[Voice]',
    file: '[File]',
    map: '[Location]',
    notice: '[Notice]',
  },
  es: {
    image: '[Foto]',
    video: '[Video]',
    audio: '[Voz]',
    file: '[Archivo]',
    map: '[Ubicación]',
    notice: '[Aviso]',
  },
  fr: {
    image: '[Photo]',
    video: '[Vidéo]',
    audio: '[Audio]',
    file: '[Fichier]',
    map: '[Position]',
    notice: '[Avis]',
  },
  hi: {
    image: '[फ़ोटो]',
    video: '[वीडियो]',
    audio: '[आवाज़]',
    file: '[फ़ाइल]',
    map: '[स्थान]',
    notice: '[सूचना]',
  },
  id: {
    image: '[Foto]',
    video: '[Video]',
    audio: '[Suara]',
    file: '[File]',
    map: '[Lokasi]',
    notice: '[Notifikasi]',
  },
  it: {
    image: '[Foto]',
    video: '[Video]',
    audio: '[Voce]',
    file: '[File]',
    map: '[Posizione]',
    notice: '[Avviso]',
  },
  ja: {
    image: '[写真]',
    video: '[動画]',
    audio: '[音声]',
    file: '[ファイル]',
    map: '[位置]',
    notice: '[お知らせ]',
  },
  ko: {
    image: '[사진]',
    video: '[동영상]',
    audio: '[음성]',
    file: '[파일]',
    map: '[위치]',
    notice: '[알림]',
  },
  pt: {
    image: '[Foto]',
    video: '[Vídeo]',
    audio: '[Voz]',
    file: '[Arquivo]',
    map: '[Localização]',
    notice: '[Aviso]',
  },
  ru: {
    image: '[Фото]',
    video: '[Видео]',
    audio: '[Голос]',
    file: '[Файл]',
    map: '[Место]',
    notice: '[Уведомление]',
  },
  th: {
    image: '[รูปภาพ]',
    video: '[วิดีโอ]',
    audio: '[เสียง]',
    file: '[ไฟล์]',
    map: '[ตำแหน่ง]',
    notice: '[ประกาศ]',
  },
  tr: {
    image: '[Fotoğraf]',
    video: '[Video]',
    audio: '[Ses]',
    file: '[Dosya]',
    map: '[Konum]',
    notice: '[Duyuru]',
  },
  vi: {
    image: '[Ảnh]',
    video: '[Video]',
    audio: '[Giọng nói]',
    file: '[Tệp]',
    map: '[Vị trí]',
    notice: '[Thông báo]',
  },
  'zh-Hans': {
    image: '[照片]',
    video: '[视频]',
    audio: '[语音]',
    file: '[文件]',
    map: '[位置]',
    notice: '[公告]',
  },
  'zh-Hant': {
    image: '[照片]',
    video: '[影片]',
    audio: '[語音]',
    file: '[檔案]',
    map: '[位置]',
    notice: '[公告]',
  },
};

const root = process.cwd();
const localesDir = path.join(root, 'src', 'locales');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function patchNamespaceChatJson(lang, preview) {
  const filePath = path.join(localesDir, lang, 'chat.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`[skip] missing namespace chat.json: ${path.relative(root, filePath)}`);
    return false;
  }

  const json = readJson(filePath);
  const roomCard = ensureObject(json, 'roomCard');
  roomCard.preview = {
    ...(roomCard.preview && typeof roomCard.preview === 'object' && !Array.isArray(roomCard.preview)
      ? roomCard.preview
      : {}),
    ...preview,
  };
  writeJson(filePath, json);
  console.log(`[ok] ${path.relative(root, filePath)}`);
  return true;
}

function patchLegacyBundleJson(lang, preview) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) return false;

  const json = readJson(filePath);
  const chat = ensureObject(json, 'chat');
  const roomCard = ensureObject(chat, 'roomCard');
  roomCard.preview = {
    ...(roomCard.preview && typeof roomCard.preview === 'object' && !Array.isArray(roomCard.preview)
      ? roomCard.preview
      : {}),
    ...preview,
  };
  writeJson(filePath, json);
  console.log(`[ok] ${path.relative(root, filePath)} (legacy bundle)`);
  return true;
}

if (!fs.existsSync(localesDir)) {
  console.error(`locales directory not found: ${localesDir}`);
  process.exit(1);
}

let patched = 0;
for (const [lang, preview] of Object.entries(PREVIEW_TRANSLATIONS)) {
  if (patchNamespaceChatJson(lang, preview)) patched += 1;
  if (patchLegacyBundleJson(lang, preview)) patched += 1;
}

console.log(`Done. Patched ${patched} locale file(s).`);
