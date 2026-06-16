const fs = require('fs');
const path = require('path');

const root = process.cwd();
const localeRoot = path.join(root, 'src', 'locales');

const additions = {
  "ko": {
    "meetingTitle": "어떤 모임인가요?",
    "requireApprovalTitle": "승인 후 입장",
    "requireApprovalDesc": "방장이 승인한 사람만 참여할 수 있습니다.",
    "hideFromFriendsTitle": "내 친구에게 숨기기",
    "hideFromFriendsDesc": "전체 공개지만 내 지인에게는 노출하지 않습니다.",
    "selectedGroupsCount": "선택된 그룹 {{count}}개",
    "selectedFriendsCount": "선택된 친구 {{count}}명",
    "friendLocationDesc": "비공개 대상에게만 보이는 위치 안내입니다. 현재 위치 기준 200m 이내에서 선택할 수 있습니다.",
    "locationPickTitle": "지도에서 선택",
    "locationPickHint": "선택한 주소가 아래에 표시됩니다.",
    "friendLocationEmpty": "선택한 위치가 없습니다. 오른쪽 버튼으로 지도를 열어 주세요.",
    "moveToCurrentLocation": "현재 위치로 수정"
  },
  "en": {
    "meetingTitle": "What is this beacon for?",
    "requireApprovalTitle": "Require approval",
    "requireApprovalDesc": "Only people approved by the host can join.",
    "hideFromFriendsTitle": "Hide from my friends",
    "hideFromFriendsDesc": "Publicly visible, but hidden from your contacts.",
    "selectedGroupsCount": "{{count}} groups selected",
    "selectedFriendsCount": "{{count}} friends selected",
    "friendLocationDesc": "A location note shown only to the selected audience. Choose within 200m of your current location.",
    "locationPickTitle": "Choose on map",
    "locationPickHint": "The selected address will appear below.",
    "friendLocationEmpty": "No location selected. Open the map with the button on the right.",
    "moveToCurrentLocation": "Use current location"
  },
  "ja": {
    "meetingTitle": "どんな集まりですか？",
    "requireApprovalTitle": "承認制で参加",
    "requireApprovalDesc": "ホストが承認した人だけ参加できます。",
    "hideFromFriendsTitle": "友だちに表示しない",
    "hideFromFriendsDesc": "公開表示のまま、知り合いには表示しません。",
    "selectedGroupsCount": "選択済みグループ {{count}}件",
    "selectedFriendsCount": "選択済み友だち {{count}}人",
    "friendLocationDesc": "選択した相手にだけ表示される位置案内です。現在地から200m以内で選択できます。",
    "locationPickTitle": "地図で選択",
    "locationPickHint": "選択した住所が下に表示されます。",
    "friendLocationEmpty": "位置が選択されていません。右のボタンで地図を開いてください。",
    "moveToCurrentLocation": "現在地に変更"
  },
  "zh-Hans": {
    "meetingTitle": "这是什么聚会？",
    "requireApprovalTitle": "需批准加入",
    "requireApprovalDesc": "仅主持人批准的用户可以加入。",
    "hideFromFriendsTitle": "对我的好友隐藏",
    "hideFromFriendsDesc": "保持公开，但不向熟人显示。",
    "selectedGroupsCount": "已选 {{count}} 个群组",
    "selectedFriendsCount": "已选 {{count}} 位好友",
    "friendLocationDesc": "仅向指定对象显示的位置说明。可在当前位置200米内选择。",
    "locationPickTitle": "在地图中选择",
    "locationPickHint": "所选地址会显示在下方。",
    "friendLocationEmpty": "尚未选择位置。请用右侧按钮打开地图。",
    "moveToCurrentLocation": "改为当前位置"
  },
  "zh-Hant": {
    "meetingTitle": "這是什麼聚會？",
    "requireApprovalTitle": "需核准加入",
    "requireApprovalDesc": "僅主持人核准的使用者可以加入。",
    "hideFromFriendsTitle": "對我的好友隱藏",
    "hideFromFriendsDesc": "保持公開，但不向熟人顯示。",
    "selectedGroupsCount": "已選 {{count}} 個群組",
    "selectedFriendsCount": "已選 {{count}} 位好友",
    "friendLocationDesc": "僅向指定對象顯示的位置說明。可在目前位置200公尺內選擇。",
    "locationPickTitle": "在地圖中選擇",
    "locationPickHint": "所選地址會顯示在下方。",
    "friendLocationEmpty": "尚未選擇位置。請用右側按鈕開啟地圖。",
    "moveToCurrentLocation": "改為目前位置"
  },
  "es": {
    "meetingTitle": "¿De qué trata el beacon?",
    "requireApprovalTitle": "Requiere aprobación",
    "requireApprovalDesc": "Solo podrán entrar quienes apruebe el anfitrión.",
    "hideFromFriendsTitle": "Ocultar a mis amigos",
    "hideFromFriendsDesc": "Será público, pero no visible para tus contactos.",
    "selectedGroupsCount": "{{count}} grupos seleccionados",
    "selectedFriendsCount": "{{count}} amigos seleccionados",
    "friendLocationDesc": "Nota de ubicación visible solo para el público elegido. Puedes elegir dentro de 200 m de tu ubicación actual.",
    "locationPickTitle": "Elegir en el mapa",
    "locationPickHint": "La dirección seleccionada aparecerá abajo.",
    "friendLocationEmpty": "No hay ubicación seleccionada. Abre el mapa con el botón derecho.",
    "moveToCurrentLocation": "Usar ubicación actual"
  },
  "pt": {
    "meetingTitle": "Qual é o tema do beacon?",
    "requireApprovalTitle": "Exigir aprovação",
    "requireApprovalDesc": "Só entra quem for aprovado pelo anfitrião.",
    "hideFromFriendsTitle": "Ocultar dos meus amigos",
    "hideFromFriendsDesc": "Continua público, mas não aparece para seus contatos.",
    "selectedGroupsCount": "{{count}} grupos selecionados",
    "selectedFriendsCount": "{{count}} amigos selecionados",
    "friendLocationDesc": "Nota de localização visível apenas para o público escolhido. Escolha dentro de 200 m da sua localização atual.",
    "locationPickTitle": "Escolher no mapa",
    "locationPickHint": "O endereço escolhido aparecerá abaixo.",
    "friendLocationEmpty": "Nenhum local selecionado. Abra o mapa pelo botão à direita.",
    "moveToCurrentLocation": "Usar localização atual"
  },
  "fr": {
    "meetingTitle": "Quel est l’objet du beacon ?",
    "requireApprovalTitle": "Approbation requise",
    "requireApprovalDesc": "Seules les personnes approuvées par l’hôte peuvent rejoindre.",
    "hideFromFriendsTitle": "Masquer à mes amis",
    "hideFromFriendsDesc": "Visible publiquement, mais masqué à vos contacts.",
    "selectedGroupsCount": "{{count}} groupes sélectionnés",
    "selectedFriendsCount": "{{count}} amis sélectionnés",
    "friendLocationDesc": "Note de lieu visible uniquement par le public choisi. Choisissez dans un rayon de 200 m autour de votre position.",
    "locationPickTitle": "Choisir sur la carte",
    "locationPickHint": "L’adresse choisie apparaîtra ci-dessous.",
    "friendLocationEmpty": "Aucun lieu sélectionné. Ouvrez la carte avec le bouton à droite.",
    "moveToCurrentLocation": "Utiliser ma position"
  },
  "de": {
    "meetingTitle": "Worum geht es bei diesem Beacon?",
    "requireApprovalTitle": "Genehmigung erforderlich",
    "requireApprovalDesc": "Nur vom Host bestätigte Personen können beitreten.",
    "hideFromFriendsTitle": "Vor meinen Freunden ausblenden",
    "hideFromFriendsDesc": "Öffentlich sichtbar, aber für deine Kontakte ausgeblendet.",
    "selectedGroupsCount": "{{count}} Gruppen ausgewählt",
    "selectedFriendsCount": "{{count}} Freunde ausgewählt",
    "friendLocationDesc": "Standorthinweis nur für die gewählte Zielgruppe. Wähle innerhalb von 200 m um deinen aktuellen Standort.",
    "locationPickTitle": "Auf Karte wählen",
    "locationPickHint": "Die gewählte Adresse erscheint unten.",
    "friendLocationEmpty": "Kein Standort ausgewählt. Öffne die Karte über die rechte Schaltfläche.",
    "moveToCurrentLocation": "Aktuellen Standort nutzen"
  },
  "id": {
    "meetingTitle": "Beacon ini untuk apa?",
    "requireApprovalTitle": "Perlu persetujuan",
    "requireApprovalDesc": "Hanya orang yang disetujui host yang bisa bergabung.",
    "hideFromFriendsTitle": "Sembunyikan dari teman",
    "hideFromFriendsDesc": "Tetap publik, tetapi tidak tampil ke kontak Anda.",
    "selectedGroupsCount": "{{count}} grup dipilih",
    "selectedFriendsCount": "{{count}} teman dipilih",
    "friendLocationDesc": "Catatan lokasi yang hanya terlihat oleh audiens terpilih. Pilih dalam 200 m dari lokasi Anda.",
    "locationPickTitle": "Pilih di peta",
    "locationPickHint": "Alamat yang dipilih akan tampil di bawah.",
    "friendLocationEmpty": "Belum ada lokasi. Buka peta dengan tombol di kanan.",
    "moveToCurrentLocation": "Gunakan lokasi saat ini"
  },
  "hi": {
    "meetingTitle": "यह बीकन किसके लिए है?",
    "requireApprovalTitle": "स्वीकृति आवश्यक",
    "requireApprovalDesc": "होस्ट द्वारा स्वीकृत लोग ही शामिल हो सकते हैं।",
    "hideFromFriendsTitle": "मेरे दोस्तों से छिपाएँ",
    "hideFromFriendsDesc": "यह सार्वजनिक रहेगा, पर आपके संपर्कों को नहीं दिखेगा।",
    "selectedGroupsCount": "{{count}} समूह चुने गए",
    "selectedFriendsCount": "{{count}} दोस्त चुने गए",
    "friendLocationDesc": "यह स्थान नोट सिर्फ चुने गए लोगों को दिखेगा। अपनी वर्तमान लोकेशन से 200m के भीतर चुनें।",
    "locationPickTitle": "मैप पर चुनें",
    "locationPickHint": "चुना गया पता नीचे दिखेगा।",
    "friendLocationEmpty": "कोई स्थान नहीं चुना गया। दाएँ बटन से मैप खोलें।",
    "moveToCurrentLocation": "वर्तमान लोकेशन इस्तेमाल करें"
  },
  "ru": {
    "meetingTitle": "Для чего этот beacon?",
    "requireApprovalTitle": "Требуется одобрение",
    "requireApprovalDesc": "Присоединиться смогут только одобренные хостом пользователи.",
    "hideFromFriendsTitle": "Скрыть от моих друзей",
    "hideFromFriendsDesc": "Beacon останется публичным, но не будет виден вашим контактам.",
    "selectedGroupsCount": "Выбрано групп: {{count}}",
    "selectedFriendsCount": "Выбрано друзей: {{count}}",
    "friendLocationDesc": "Подсказка о месте видна только выбранной аудитории. Можно выбрать в радиусе 200 м от текущего места.",
    "locationPickTitle": "Выбрать на карте",
    "locationPickHint": "Выбранный адрес появится ниже.",
    "friendLocationEmpty": "Место не выбрано. Откройте карту кнопкой справа.",
    "moveToCurrentLocation": "Использовать текущее место"
  },
  "ar": {
    "meetingTitle": "ما هدف هذا البيكون؟",
    "requireApprovalTitle": "يتطلب الموافقة",
    "requireApprovalDesc": "يمكن فقط لمن يوافق عليهم المضيف الانضمام.",
    "hideFromFriendsTitle": "إخفاء عن أصدقائي",
    "hideFromFriendsDesc": "يبقى عامًا، لكنه لا يظهر لجهات اتصالك.",
    "selectedGroupsCount": "تم اختيار {{count}} مجموعات",
    "selectedFriendsCount": "تم اختيار {{count}} أصدقاء",
    "friendLocationDesc": "ملاحظة موقع تظهر فقط للجمهور المحدد. اختر ضمن 200 م من موقعك الحالي.",
    "locationPickTitle": "اختر على الخريطة",
    "locationPickHint": "سيظهر العنوان المحدد أدناه.",
    "friendLocationEmpty": "لم يتم اختيار موقع. افتح الخريطة من الزر الأيمن.",
    "moveToCurrentLocation": "استخدام الموقع الحالي"
  },
  "vi": {
    "meetingTitle": "Beacon này dành cho gì?",
    "requireApprovalTitle": "Cần phê duyệt",
    "requireApprovalDesc": "Chỉ người được chủ phòng duyệt mới có thể tham gia.",
    "hideFromFriendsTitle": "Ẩn với bạn bè",
    "hideFromFriendsDesc": "Vẫn công khai, nhưng không hiển thị với liên hệ của bạn.",
    "selectedGroupsCount": "Đã chọn {{count}} nhóm",
    "selectedFriendsCount": "Đã chọn {{count}} bạn bè",
    "friendLocationDesc": "Ghi chú vị trí chỉ hiển thị cho đối tượng đã chọn. Chọn trong phạm vi 200 m từ vị trí hiện tại.",
    "locationPickTitle": "Chọn trên bản đồ",
    "locationPickHint": "Địa chỉ đã chọn sẽ hiển thị bên dưới.",
    "friendLocationEmpty": "Chưa chọn vị trí. Mở bản đồ bằng nút bên phải.",
    "moveToCurrentLocation": "Dùng vị trí hiện tại"
  },
  "tr": {
    "meetingTitle": "Bu beacon ne için?",
    "requireApprovalTitle": "Onay gerekli",
    "requireApprovalDesc": "Yalnızca ev sahibinin onayladığı kişiler katılabilir.",
    "hideFromFriendsTitle": "Arkadaşlarımdan gizle",
    "hideFromFriendsDesc": "Herkese açık kalır, ancak kişilerine gösterilmez.",
    "selectedGroupsCount": "{{count}} grup seçildi",
    "selectedFriendsCount": "{{count}} arkadaş seçildi",
    "friendLocationDesc": "Yalnızca seçilen kitleye görünen konum notu. Mevcut konumunuzdan 200 m içinde seçin.",
    "locationPickTitle": "Haritada seç",
    "locationPickHint": "Seçilen adres aşağıda görünür.",
    "friendLocationEmpty": "Konum seçilmedi. Sağdaki düğmeyle haritayı açın.",
    "moveToCurrentLocation": "Geçerli konumu kullan"
  },
  "th": {
    "meetingTitle": "บีคอนนี้สำหรับอะไร?",
    "requireApprovalTitle": "ต้องอนุมัติก่อนเข้าร่วม",
    "requireApprovalDesc": "เฉพาะผู้ที่โฮสต์อนุมัติเท่านั้นที่เข้าร่วมได้",
    "hideFromFriendsTitle": "ซ่อนจากเพื่อนของฉัน",
    "hideFromFriendsDesc": "ยังคงเป็นสาธารณะ แต่ไม่แสดงต่อคนรู้จักของคุณ",
    "selectedGroupsCount": "เลือกกลุ่มแล้ว {{count}} กลุ่ม",
    "selectedFriendsCount": "เลือกเพื่อนแล้ว {{count}} คน",
    "friendLocationDesc": "โน้ตตำแหน่งที่แสดงเฉพาะกลุ่มเป้าหมายที่เลือก เลือกได้ภายใน 200 ม. จากตำแหน่งปัจจุบัน",
    "locationPickTitle": "เลือกบนแผนที่",
    "locationPickHint": "ที่อยู่ที่เลือกจะแสดงด้านล่าง",
    "friendLocationEmpty": "ยังไม่ได้เลือกตำแหน่ง เปิดแผนที่ด้วยปุ่มด้านขวา",
    "moveToCurrentLocation": "ใช้ตำแหน่งปัจจุบัน"
  },
  "it": {
    "meetingTitle": "A cosa serve questo beacon?",
    "requireApprovalTitle": "Richiedi approvazione",
    "requireApprovalDesc": "Potranno entrare solo le persone approvate dall’host.",
    "hideFromFriendsTitle": "Nascondi ai miei amici",
    "hideFromFriendsDesc": "Resta pubblico, ma non visibile ai tuoi contatti.",
    "selectedGroupsCount": "{{count}} gruppi selezionati",
    "selectedFriendsCount": "{{count}} amici selezionati",
    "friendLocationDesc": "Nota posizione visibile solo al pubblico scelto. Scegli entro 200 m dalla tua posizione attuale.",
    "locationPickTitle": "Scegli sulla mappa",
    "locationPickHint": "L’indirizzo scelto apparirà sotto.",
    "friendLocationEmpty": "Nessuna posizione selezionata. Apri la mappa con il pulsante a destra.",
    "moveToCurrentLocation": "Usa posizione attuale"
  }
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function backupOnce(file) {
  const backup = file + '.bak-beacon-i18n';
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
}

const langs = Object.keys(additions);
const missing = [];
const changed = [];

for (const lang of langs) {
  const file = path.join(localeRoot, lang, 'beacons.json');
  if (!fs.existsSync(file)) {
    missing.push(file);
    continue;
  }

  const json = readJson(file);
  if (!json.form || typeof json.form !== 'object' || Array.isArray(json.form)) json.form = {};

  let touched = false;
  for (const [key, value] of Object.entries(additions[lang])) {
    if (json.form[key] !== value) {
      json.form[key] = value;
      touched = true;
    }
  }

  if (touched) {
    backupOnce(file);
    writeJson(file, json);
    changed.push(path.relative(root, file));
  }
}

console.log('[beacon i18n] changed files:', changed.length ? changed.join(', ') : 'none');
if (missing.length) {
  console.warn('[beacon i18n] missing files:');
  for (const file of missing) console.warn(' - ' + path.relative(root, file));
}
console.log('[beacon i18n] backups: *.bak-beacon-i18n');
