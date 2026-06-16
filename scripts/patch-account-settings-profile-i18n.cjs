const fs = require('fs');
const path = require('path');

const patches = {
  "ko": {
    "section": {
      "profile": "프로필"
    },
    "field": {
      "profile_photo": "프로필 사진",
      "nickname": "닉네임"
    },
    "placeholder": {
      "nickname": "닉네임"
    },
    "action": {
      "change_photo": "사진 변경",
      "remove_photo": "사진 삭제"
    },
    "picker": {
      "profile_photo": "사진 선택"
    },
    "error": {
      "nickname_required": "닉네임을 입력해주세요.",
      "nickname_too_long": "닉네임은 30자까지 입력할 수 있습니다."
    }
  },
  "en": {
    "section": {
      "profile": "Profile"
    },
    "field": {
      "profile_photo": "Profile photo",
      "nickname": "Nickname"
    },
    "placeholder": {
      "nickname": "Nickname"
    },
    "action": {
      "change_photo": "Change photo",
      "remove_photo": "Remove photo"
    },
    "picker": {
      "profile_photo": "Select photo"
    },
    "error": {
      "nickname_required": "Enter a nickname.",
      "nickname_too_long": "Nickname can be up to 30 characters."
    }
  },
  "ja": {
    "section": {
      "profile": "プロフィール"
    },
    "field": {
      "profile_photo": "プロフィール写真",
      "nickname": "ニックネーム"
    },
    "placeholder": {
      "nickname": "ニックネーム"
    },
    "action": {
      "change_photo": "写真を変更",
      "remove_photo": "写真を削除"
    },
    "picker": {
      "profile_photo": "写真を選択"
    },
    "error": {
      "nickname_required": "ニックネームを入力してください。",
      "nickname_too_long": "ニックネームは30文字までです。"
    }
  },
  "zh-Hans": {
    "section": {
      "profile": "个人资料"
    },
    "field": {
      "profile_photo": "头像",
      "nickname": "昵称"
    },
    "placeholder": {
      "nickname": "昵称"
    },
    "action": {
      "change_photo": "更换照片",
      "remove_photo": "删除照片"
    },
    "picker": {
      "profile_photo": "选择照片"
    },
    "error": {
      "nickname_required": "请输入昵称。",
      "nickname_too_long": "昵称最多30个字符。"
    }
  },
  "zh-Hant": {
    "section": {
      "profile": "個人資料"
    },
    "field": {
      "profile_photo": "頭像",
      "nickname": "暱稱"
    },
    "placeholder": {
      "nickname": "暱稱"
    },
    "action": {
      "change_photo": "更換照片",
      "remove_photo": "刪除照片"
    },
    "picker": {
      "profile_photo": "選擇照片"
    },
    "error": {
      "nickname_required": "請輸入暱稱。",
      "nickname_too_long": "暱稱最多30個字。"
    }
  },
  "es": {
    "section": {
      "profile": "Perfil"
    },
    "field": {
      "profile_photo": "Foto de perfil",
      "nickname": "Apodo"
    },
    "placeholder": {
      "nickname": "Apodo"
    },
    "action": {
      "change_photo": "Cambiar foto",
      "remove_photo": "Quitar foto"
    },
    "picker": {
      "profile_photo": "Seleccionar foto"
    },
    "error": {
      "nickname_required": "Ingresa un apodo.",
      "nickname_too_long": "El apodo puede tener hasta 30 caracteres."
    }
  },
  "pt": {
    "section": {
      "profile": "Perfil"
    },
    "field": {
      "profile_photo": "Foto de perfil",
      "nickname": "Apelido"
    },
    "placeholder": {
      "nickname": "Apelido"
    },
    "action": {
      "change_photo": "Alterar foto",
      "remove_photo": "Remover foto"
    },
    "picker": {
      "profile_photo": "Selecionar foto"
    },
    "error": {
      "nickname_required": "Insira um apelido.",
      "nickname_too_long": "O apelido pode ter até 30 caracteres."
    }
  },
  "fr": {
    "section": {
      "profile": "Profil"
    },
    "field": {
      "profile_photo": "Photo de profil",
      "nickname": "Pseudo"
    },
    "placeholder": {
      "nickname": "Pseudo"
    },
    "action": {
      "change_photo": "Changer la photo",
      "remove_photo": "Supprimer la photo"
    },
    "picker": {
      "profile_photo": "Choisir une photo"
    },
    "error": {
      "nickname_required": "Saisissez un pseudo.",
      "nickname_too_long": "Le pseudo peut contenir jusqu’à 30 caractères."
    }
  },
  "de": {
    "section": {
      "profile": "Profil"
    },
    "field": {
      "profile_photo": "Profilfoto",
      "nickname": "Nickname"
    },
    "placeholder": {
      "nickname": "Nickname"
    },
    "action": {
      "change_photo": "Foto ändern",
      "remove_photo": "Foto entfernen"
    },
    "picker": {
      "profile_photo": "Foto auswählen"
    },
    "error": {
      "nickname_required": "Gib einen Nickname ein.",
      "nickname_too_long": "Der Nickname darf bis zu 30 Zeichen lang sein."
    }
  },
  "id": {
    "section": {
      "profile": "Profil"
    },
    "field": {
      "profile_photo": "Foto profil",
      "nickname": "Nama panggilan"
    },
    "placeholder": {
      "nickname": "Nama panggilan"
    },
    "action": {
      "change_photo": "Ubah foto",
      "remove_photo": "Hapus foto"
    },
    "picker": {
      "profile_photo": "Pilih foto"
    },
    "error": {
      "nickname_required": "Masukkan nama panggilan.",
      "nickname_too_long": "Nama panggilan maksimal 30 karakter."
    }
  },
  "hi": {
    "section": {
      "profile": "प्रोफ़ाइल"
    },
    "field": {
      "profile_photo": "प्रोफ़ाइल फ़ोटो",
      "nickname": "निकनेम"
    },
    "placeholder": {
      "nickname": "निकनेम"
    },
    "action": {
      "change_photo": "फ़ोटो बदलें",
      "remove_photo": "फ़ोटो हटाएँ"
    },
    "picker": {
      "profile_photo": "फ़ोटो चुनें"
    },
    "error": {
      "nickname_required": "निकनेम दर्ज करें।",
      "nickname_too_long": "निकनेम 30 अक्षरों तक हो सकता है।"
    }
  },
  "ru": {
    "section": {
      "profile": "Профиль"
    },
    "field": {
      "profile_photo": "Фото профиля",
      "nickname": "Никнейм"
    },
    "placeholder": {
      "nickname": "Никнейм"
    },
    "action": {
      "change_photo": "Изменить фото",
      "remove_photo": "Удалить фото"
    },
    "picker": {
      "profile_photo": "Выбрать фото"
    },
    "error": {
      "nickname_required": "Введите никнейм.",
      "nickname_too_long": "Никнейм может содержать до 30 символов."
    }
  },
  "ar": {
    "section": {
      "profile": "الملف الشخصي"
    },
    "field": {
      "profile_photo": "صورة الملف الشخصي",
      "nickname": "الاسم المستعار"
    },
    "placeholder": {
      "nickname": "الاسم المستعار"
    },
    "action": {
      "change_photo": "تغيير الصورة",
      "remove_photo": "إزالة الصورة"
    },
    "picker": {
      "profile_photo": "اختيار صورة"
    },
    "error": {
      "nickname_required": "أدخل اسمًا مستعارًا.",
      "nickname_too_long": "يمكن أن يصل الاسم المستعار إلى 30 حرفًا."
    }
  },
  "vi": {
    "section": {
      "profile": "Hồ sơ"
    },
    "field": {
      "profile_photo": "Ảnh hồ sơ",
      "nickname": "Biệt danh"
    },
    "placeholder": {
      "nickname": "Biệt danh"
    },
    "action": {
      "change_photo": "Đổi ảnh",
      "remove_photo": "Xóa ảnh"
    },
    "picker": {
      "profile_photo": "Chọn ảnh"
    },
    "error": {
      "nickname_required": "Nhập biệt danh.",
      "nickname_too_long": "Biệt danh tối đa 30 ký tự."
    }
  },
  "tr": {
    "section": {
      "profile": "Profil"
    },
    "field": {
      "profile_photo": "Profil fotoğrafı",
      "nickname": "Takma ad"
    },
    "placeholder": {
      "nickname": "Takma ad"
    },
    "action": {
      "change_photo": "Fotoğrafı değiştir",
      "remove_photo": "Fotoğrafı kaldır"
    },
    "picker": {
      "profile_photo": "Fotoğraf seç"
    },
    "error": {
      "nickname_required": "Bir takma ad gir.",
      "nickname_too_long": "Takma ad en fazla 30 karakter olabilir."
    }
  },
  "th": {
    "section": {
      "profile": "โปรไฟล์"
    },
    "field": {
      "profile_photo": "รูปโปรไฟล์",
      "nickname": "ชื่อเล่น"
    },
    "placeholder": {
      "nickname": "ชื่อเล่น"
    },
    "action": {
      "change_photo": "เปลี่ยนรูป",
      "remove_photo": "ลบรูป"
    },
    "picker": {
      "profile_photo": "เลือกรูป"
    },
    "error": {
      "nickname_required": "กรุณาใส่ชื่อเล่น",
      "nickname_too_long": "ชื่อเล่นยาวได้สูงสุด 30 ตัวอักษร"
    }
  },
  "it": {
    "section": {
      "profile": "Profilo"
    },
    "field": {
      "profile_photo": "Foto profilo",
      "nickname": "Nickname"
    },
    "placeholder": {
      "nickname": "Nickname"
    },
    "action": {
      "change_photo": "Cambia foto",
      "remove_photo": "Rimuovi foto"
    },
    "picker": {
      "profile_photo": "Scegli foto"
    },
    "error": {
      "nickname_required": "Inserisci un nickname.",
      "nickname_too_long": "Il nickname può contenere fino a 30 caratteri."
    }
  }
};
const localesDir = path.join(process.cwd(), 'src', 'locales');

function merge(target, source) {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      merge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

if (!fs.existsSync(localesDir)) {
  throw new Error(`Locales directory not found: ${localesDir}`);
}

const touched = [];
for (const [locale, accountPatch] of Object.entries(patches)) {
  const file = path.join(localesDir, locale, 'settings.json');
  if (!fs.existsSync(file)) {
    console.log(`skip ${locale}: settings.json not found`);
    continue;
  }
  const json = readJson(file);
  if (!json.account || typeof json.account !== 'object' || Array.isArray(json.account)) {
    json.account = {};
  }
  merge(json.account, accountPatch);
  writeJson(file, json);
  touched.push(file);
}

console.log(`updated ${touched.length} settings locale files`);
for (const file of touched) {
  console.log(path.relative(process.cwd(), file));
}
