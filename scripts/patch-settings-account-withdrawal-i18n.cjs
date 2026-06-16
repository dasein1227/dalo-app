const fs = require('fs');
const path = require('path');

const patches = {
  ko: {
    section: { account_management: '계정 관리' },
    withdrawal: {
      entryTitle: '계정 탈퇴',
      entryDescription: '계정과 개인 정보를 삭제합니다.',
      noticeTitle: '계정 탈퇴',
      noticeMessage: '탈퇴 전 아래 내용을 확인해주세요.',
      noticeItemProfile: '프로필, 친구, 설정 정보가 삭제됩니다.',
      noticeItemChat: '일부 대화 기록은 상대방 기록 보존을 위해 탈퇴한 사용자로 표시될 수 있습니다.',
      noticeItemRejoin: '탈퇴 후 7일 동안 같은 계정으로 다시 가입할 수 없습니다.',
      noticeItemIdentifier: 'CO·ONN ID와 친구 코드는 30일 동안 재사용할 수 없습니다.',
      noticeAcknowledge: '위의 확인사항을 모두 확인하였고, 탈퇴를 진행합니다.',
      continue: '다음',
      cancel: '취소',
      surveyTitle: '떠나는 이유를 알려주세요',
      surveyMessage: '더 나은 서비스를 만드는 데 참고하겠습니다.',
      surveyAction: '계속',
      otherPlaceholder: '이유를 입력해주세요.',
      reasonRequired: '탈퇴 사유를 선택해주세요.',
      otherRequired: '이유를 입력해주세요.',
      reasonsLoading: '사유를 불러오는 중입니다.',
      reasonsEmpty: '탈퇴 사유를 불러오지 못했습니다.',
      confirmTitle: '마지막 확인',
      confirmMessage: '탈퇴하면 즉시 계정 이용이 중지됩니다.',
      confirmInstruction: '아래에 “{{keyword}}”를 입력해주세요.',
      confirmKeyword: '탈퇴',
      confirmPlaceholder: '탈퇴',
      confirmAction: '탈퇴',
      completed: '탈퇴가 접수되었습니다.',
      failed: '탈퇴 처리에 실패했습니다.'
    }
  },
  en: {
    section: { account_management: 'Account' },
    withdrawal: {
      entryTitle: 'Delete account',
      entryDescription: 'Delete your account and personal data.',
      noticeTitle: 'Delete account',
      noticeMessage: 'Please review these items before continuing.',
      noticeItemProfile: 'Your profile, friends, and settings will be deleted.',
      noticeItemChat: 'Some chat history may remain for other participants and show as a deleted user.',
      noticeItemRejoin: 'You cannot rejoin with the same account for 7 days.',
      noticeItemIdentifier: 'Your CO·ONN ID and friend code cannot be reused for 30 days.',
      noticeAcknowledge: 'I have reviewed the items above and want to continue.',
      continue: 'Next',
      cancel: 'Cancel',
      surveyTitle: 'Tell us why you are leaving',
      surveyMessage: 'Your feedback helps us improve CO·ONN.',
      surveyAction: 'Continue',
      otherPlaceholder: 'Enter your reason.',
      reasonRequired: 'Select a reason.',
      otherRequired: 'Enter your reason.',
      reasonsLoading: 'Loading reasons.',
      reasonsEmpty: 'Could not load reasons.',
      confirmTitle: 'Final check',
      confirmMessage: 'Your account access will stop immediately.',
      confirmInstruction: 'Type “{{keyword}}” below.',
      confirmKeyword: 'DELETE',
      confirmPlaceholder: 'DELETE',
      confirmAction: 'Delete',
      completed: 'Deletion requested.',
      failed: 'Could not delete your account.'
    }
  },
  ja: {
    section: { account_management: 'アカウント管理' },
    withdrawal: {
      entryTitle: 'アカウント削除',
      entryDescription: 'アカウントと個人情報を削除します。',
      noticeTitle: 'アカウント削除',
      noticeMessage: '続行する前に以下をご確認ください。',
      noticeItemProfile: 'プロフィール、友だち、設定情報が削除されます。',
      noticeItemChat: '一部のトーク履歴は相手側に残り、削除済みユーザーとして表示される場合があります。',
      noticeItemRejoin: '削除後7日間は同じアカウントで再登録できません。',
      noticeItemIdentifier: 'CO·ONN IDと友だちコードは30日間再利用できません。',
      noticeAcknowledge: '上記をすべて確認し、削除を続行します。',
      continue: '次へ',
      cancel: 'キャンセル',
      surveyTitle: '退会理由を教えてください',
      surveyMessage: 'CO·ONNの改善に活用します。',
      surveyAction: '続行',
      otherPlaceholder: '理由を入力してください。',
      reasonRequired: '理由を選択してください。',
      otherRequired: '理由を入力してください。',
      reasonsLoading: '理由を読み込み中です。',
      reasonsEmpty: '理由を読み込めませんでした。',
      confirmTitle: '最終確認',
      confirmMessage: 'アカウントは直ちに利用停止になります。',
      confirmInstruction: '下に「{{keyword}}」と入力してください。',
      confirmKeyword: '削除',
      confirmPlaceholder: '削除',
      confirmAction: '削除',
      completed: '削除を受け付けました。',
      failed: '削除できませんでした。'
    }
  },
  'zh-Hans': {
    section: { account_management: '账号管理' },
    withdrawal: {
      entryTitle: '删除账号', entryDescription: '删除账号和个人信息。', noticeTitle: '删除账号', noticeMessage: '继续前请确认以下事项。', noticeItemProfile: '个人资料、好友和设置将被删除。', noticeItemChat: '部分聊天记录可能为其他参与者保留，并显示为已删除用户。', noticeItemRejoin: '删除后7天内不能使用同一账号重新注册。', noticeItemIdentifier: 'CO·ONN ID和好友代码30天内不可重复使用。', noticeAcknowledge: '我已确认以上事项，并继续删除。', continue: '下一步', cancel: '取消', surveyTitle: '请告诉我们离开的原因', surveyMessage: '你的反馈将帮助我们改进CO·ONN。', surveyAction: '继续', otherPlaceholder: '请输入原因。', reasonRequired: '请选择原因。', otherRequired: '请输入原因。', reasonsLoading: '正在加载原因。', reasonsEmpty: '无法加载原因。', confirmTitle: '最后确认', confirmMessage: '账号将立即停止使用。', confirmInstruction: '请在下方输入“{{keyword}}”。', confirmKeyword: '删除', confirmPlaceholder: '删除', confirmAction: '删除', completed: '删除请求已提交。', failed: '删除失败。'
    }
  },
  'zh-Hant': {
    section: { account_management: '帳號管理' },
    withdrawal: {
      entryTitle: '刪除帳號', entryDescription: '刪除帳號與個人資料。', noticeTitle: '刪除帳號', noticeMessage: '繼續前請確認以下事項。', noticeItemProfile: '個人資料、好友與設定將被刪除。', noticeItemChat: '部分聊天記錄可能為其他參與者保留，並顯示為已刪除用戶。', noticeItemRejoin: '刪除後7天內無法使用同一帳號重新註冊。', noticeItemIdentifier: 'CO·ONN ID和好友代碼30天內不可重複使用。', noticeAcknowledge: '我已確認以上事項，並繼續刪除。', continue: '下一步', cancel: '取消', surveyTitle: '請告訴我們離開的原因', surveyMessage: '你的回饋將幫助我們改進CO·ONN。', surveyAction: '繼續', otherPlaceholder: '請輸入原因。', reasonRequired: '請選擇原因。', otherRequired: '請輸入原因。', reasonsLoading: '正在載入原因。', reasonsEmpty: '無法載入原因。', confirmTitle: '最後確認', confirmMessage: '帳號將立即停止使用。', confirmInstruction: '請在下方輸入「{{keyword}}」。', confirmKeyword: '刪除', confirmPlaceholder: '刪除', confirmAction: '刪除', completed: '刪除請求已提交。', failed: '刪除失敗。'
    }
  }
};

const englishBased = {
  de: ['Konto', 'Konto löschen', 'Konto und personenbezogene Daten löschen.', 'Bitte prüfen Sie diese Punkte, bevor Sie fortfahren.', 'Ihr Profil, Freunde und Einstellungen werden gelöscht.', 'Einige Chatverläufe können für andere Teilnehmer erhalten bleiben und als gelöschter Nutzer erscheinen.', 'Sie können sich 7 Tage lang nicht mit demselben Konto neu registrieren.', 'CO·ONN ID und Freundescode können 30 Tage lang nicht wiederverwendet werden.', 'Ich habe alles geprüft und möchte fortfahren.', 'Weiter', 'Abbrechen', 'Sagen Sie uns, warum Sie gehen', 'Ihr Feedback hilft uns, CO·ONN zu verbessern.', 'Fortfahren', 'Geben Sie den Grund ein.', 'Wählen Sie einen Grund.', 'Geben Sie den Grund ein.', 'Gründe werden geladen.', 'Gründe konnten nicht geladen werden.', 'Letzte Bestätigung', 'Der Kontozugriff wird sofort beendet.', 'Geben Sie unten „{{keyword}}“ ein.', 'LÖSCHEN', 'LÖSCHEN', 'Löschen', 'Löschung angefragt.', 'Konto konnte nicht gelöscht werden.'],
  es: ['Cuenta', 'Eliminar cuenta', 'Elimina tu cuenta y datos personales.', 'Revisa estos puntos antes de continuar.', 'Tu perfil, amigos y ajustes se eliminarán.', 'Parte del historial de chat puede conservarse para otros participantes y mostrarse como usuario eliminado.', 'No podrás volver a registrarte con la misma cuenta durante 7 días.', 'Tu CO·ONN ID y código de amigo no podrán reutilizarse durante 30 días.', 'He revisado todo y quiero continuar.', 'Siguiente', 'Cancelar', 'Cuéntanos por qué te vas', 'Tus comentarios nos ayudan a mejorar CO·ONN.', 'Continuar', 'Escribe el motivo.', 'Selecciona un motivo.', 'Escribe el motivo.', 'Cargando motivos.', 'No se pudieron cargar los motivos.', 'Confirmación final', 'El acceso a tu cuenta se detendrá de inmediato.', 'Escribe “{{keyword}}” abajo.', 'ELIMINAR', 'ELIMINAR', 'Eliminar', 'Solicitud de eliminación enviada.', 'No se pudo eliminar la cuenta.'],
  fr: ['Compte', 'Supprimer le compte', 'Supprimer votre compte et vos données personnelles.', 'Veuillez vérifier ces points avant de continuer.', 'Votre profil, vos amis et vos réglages seront supprimés.', 'Certains historiques de chat peuvent rester visibles pour les autres participants comme utilisateur supprimé.', 'Vous ne pourrez pas vous réinscrire avec le même compte pendant 7 jours.', 'Votre CO·ONN ID et votre code ami ne pourront pas être réutilisés pendant 30 jours.', 'J’ai tout vérifié et je souhaite continuer.', 'Suivant', 'Annuler', 'Dites-nous pourquoi vous partez', 'Votre retour nous aide à améliorer CO·ONN.', 'Continuer', 'Saisissez la raison.', 'Sélectionnez une raison.', 'Saisissez la raison.', 'Chargement des raisons.', 'Impossible de charger les raisons.', 'Dernière confirmation', 'L’accès au compte sera immédiatement arrêté.', 'Saisissez « {{keyword}} » ci-dessous.', 'SUPPRIMER', 'SUPPRIMER', 'Supprimer', 'Demande de suppression envoyée.', 'Impossible de supprimer le compte.'],
  pt: ['Conta', 'Excluir conta', 'Exclua sua conta e dados pessoais.', 'Revise estes pontos antes de continuar.', 'Seu perfil, amigos e configurações serão excluídos.', 'Parte do histórico de conversa pode permanecer para outros participantes como usuário excluído.', 'Você não poderá se cadastrar com a mesma conta por 7 dias.', 'Seu CO·ONN ID e código de amigo não poderão ser reutilizados por 30 dias.', 'Revisei tudo e quero continuar.', 'Próximo', 'Cancelar', 'Conte por que você está saindo', 'Seu feedback ajuda a melhorar o CO·ONN.', 'Continuar', 'Digite o motivo.', 'Selecione um motivo.', 'Digite o motivo.', 'Carregando motivos.', 'Não foi possível carregar os motivos.', 'Confirmação final', 'O acesso à conta será interrompido imediatamente.', 'Digite “{{keyword}}” abaixo.', 'EXCLUIR', 'EXCLUIR', 'Excluir', 'Solicitação enviada.', 'Não foi possível excluir a conta.'],
  id: ['Akun', 'Hapus akun', 'Hapus akun dan data pribadi Anda.', 'Tinjau hal berikut sebelum melanjutkan.', 'Profil, teman, dan pengaturan Anda akan dihapus.', 'Sebagian riwayat chat dapat tetap ada untuk peserta lain sebagai pengguna yang dihapus.', 'Anda tidak dapat mendaftar lagi dengan akun yang sama selama 7 hari.', 'CO·ONN ID dan kode teman tidak dapat digunakan kembali selama 30 hari.', 'Saya telah meninjau semuanya dan ingin melanjutkan.', 'Berikutnya', 'Batal', 'Beri tahu alasan Anda pergi', 'Masukan Anda membantu kami meningkatkan CO·ONN.', 'Lanjutkan', 'Masukkan alasan.', 'Pilih alasan.', 'Masukkan alasan.', 'Memuat alasan.', 'Tidak dapat memuat alasan.', 'Konfirmasi akhir', 'Akses akun akan segera dihentikan.', 'Ketik “{{keyword}}” di bawah.', 'HAPUS', 'HAPUS', 'Hapus', 'Permintaan penghapusan dikirim.', 'Tidak dapat menghapus akun.'],
  it: ['Account', 'Elimina account', 'Elimina il tuo account e i dati personali.', 'Controlla questi punti prima di continuare.', 'Profilo, amici e impostazioni verranno eliminati.', 'Alcune chat possono restare visibili agli altri partecipanti come utente eliminato.', 'Non potrai registrarti con lo stesso account per 7 giorni.', 'CO·ONN ID e codice amico non potranno essere riutilizzati per 30 giorni.', 'Ho letto tutto e voglio continuare.', 'Avanti', 'Annulla', 'Dicci perché lasci CO·ONN', 'Il tuo feedback ci aiuta a migliorare CO·ONN.', 'Continua', 'Inserisci il motivo.', 'Seleziona un motivo.', 'Inserisci il motivo.', 'Caricamento motivi.', 'Impossibile caricare i motivi.', 'Conferma finale', 'L’accesso all’account verrà interrotto subito.', 'Digita “{{keyword}}” sotto.', 'ELIMINA', 'ELIMINA', 'Elimina', 'Richiesta di eliminazione inviata.', 'Impossibile eliminare l’account.'],
  ru: ['Аккаунт', 'Удалить аккаунт', 'Удалить аккаунт и личные данные.', 'Проверьте эти пункты перед продолжением.', 'Профиль, друзья и настройки будут удалены.', 'Часть истории чатов может остаться у других участников и отображаться как удаленный пользователь.', 'Вы не сможете снова зарегистрироваться с тем же аккаунтом 7 дней.', 'CO·ONN ID и код друга нельзя будет использовать 30 дней.', 'Я все проверил и хочу продолжить.', 'Далее', 'Отмена', 'Расскажите, почему вы уходите', 'Ваш отзыв поможет улучшить CO·ONN.', 'Продолжить', 'Введите причину.', 'Выберите причину.', 'Введите причину.', 'Загрузка причин.', 'Не удалось загрузить причины.', 'Последнее подтверждение', 'Доступ к аккаунту будет немедленно остановлен.', 'Введите «{{keyword}}» ниже.', 'УДАЛИТЬ', 'УДАЛИТЬ', 'Удалить', 'Запрос на удаление отправлен.', 'Не удалось удалить аккаунт.'],
  tr: ['Hesap', 'Hesabı sil', 'Hesabınızı ve kişisel verilerinizi silin.', 'Devam etmeden önce bunları gözden geçirin.', 'Profiliniz, arkadaşlarınız ve ayarlarınız silinir.', 'Bazı sohbet geçmişleri diğer katılımcılarda silinmiş kullanıcı olarak kalabilir.', 'Aynı hesapla 7 gün boyunca yeniden katılamazsınız.', 'CO·ONN ID ve arkadaş kodu 30 gün boyunca yeniden kullanılamaz.', 'Her şeyi okudum ve devam etmek istiyorum.', 'İleri', 'İptal', 'Neden ayrıldığınızı söyleyin', 'Geri bildiriminiz CO·ONN’u geliştirmemize yardımcı olur.', 'Devam', 'Nedeni girin.', 'Bir neden seçin.', 'Nedeni girin.', 'Nedenler yükleniyor.', 'Nedenler yüklenemedi.', 'Son onay', 'Hesap erişimi hemen durdurulur.', 'Aşağıya “{{keyword}}” yazın.', 'SİL', 'SİL', 'Sil', 'Silme isteği alındı.', 'Hesap silinemedi.'],
  vi: ['Tài khoản', 'Xóa tài khoản', 'Xóa tài khoản và dữ liệu cá nhân.', 'Vui lòng xem lại trước khi tiếp tục.', 'Hồ sơ, bạn bè và cài đặt sẽ bị xóa.', 'Một số lịch sử chat có thể còn lại với người tham gia khác dưới dạng người dùng đã xóa.', 'Bạn không thể đăng ký lại bằng cùng tài khoản trong 7 ngày.', 'CO·ONN ID và mã bạn bè không thể dùng lại trong 30 ngày.', 'Tôi đã xem lại và muốn tiếp tục.', 'Tiếp', 'Hủy', 'Cho chúng tôi biết lý do rời đi', 'Phản hồi giúp chúng tôi cải thiện CO·ONN.', 'Tiếp tục', 'Nhập lý do.', 'Chọn lý do.', 'Nhập lý do.', 'Đang tải lý do.', 'Không thể tải lý do.', 'Xác nhận cuối', 'Quyền truy cập tài khoản sẽ dừng ngay.', 'Nhập “{{keyword}}” bên dưới.', 'XÓA', 'XÓA', 'Xóa', 'Đã gửi yêu cầu xóa.', 'Không thể xóa tài khoản.'],
  th: ['บัญชี', 'ลบบัญชี', 'ลบบัญชีและข้อมูลส่วนตัวของคุณ', 'โปรดตรวจสอบรายการเหล่านี้ก่อนดำเนินการต่อ', 'โปรไฟล์ เพื่อน และการตั้งค่าจะถูกลบ', 'ประวัติแชทบางส่วนอาจยังคงอยู่กับผู้เข้าร่วมอื่นในฐานะผู้ใช้ที่ถูกลบ', 'คุณจะสมัครใหม่ด้วยบัญชีเดิมไม่ได้เป็นเวลา 7 วัน', 'CO·ONN ID และรหัสเพื่อนจะใช้ซ้ำไม่ได้เป็นเวลา 30 วัน', 'ฉันตรวจสอบทั้งหมดแล้วและต้องการดำเนินการต่อ', 'ถัดไป', 'ยกเลิก', 'บอกเหตุผลที่คุณออก', 'ความคิดเห็นของคุณช่วยให้ CO·ONN ดีขึ้น', 'ดำเนินการต่อ', 'กรอกเหตุผล', 'เลือกเหตุผล', 'กรอกเหตุผล', 'กำลังโหลดเหตุผล', 'โหลดเหตุผลไม่ได้', 'ยืนยันขั้นสุดท้าย', 'การเข้าถึงบัญชีจะหยุดทันที', 'พิมพ์ “{{keyword}}” ด้านล่าง', 'ลบ', 'ลบ', 'ลบ', 'ส่งคำขอลบแล้ว', 'ไม่สามารถลบบัญชีได้'],
  ar: ['الحساب', 'حذف الحساب', 'احذف حسابك وبياناتك الشخصية.', 'راجع هذه النقاط قبل المتابعة.', 'سيتم حذف ملفك الشخصي والأصدقاء والإعدادات.', 'قد تبقى بعض محادثاتك لدى المشاركين الآخرين كمستخدم محذوف.', 'لا يمكنك التسجيل مجددًا بالحساب نفسه لمدة 7 أيام.', 'لا يمكن إعادة استخدام CO·ONN ID ورمز الصديق لمدة 30 يومًا.', 'راجعت كل ما سبق وأريد المتابعة.', 'التالي', 'إلغاء', 'أخبرنا بسبب المغادرة', 'تساعدنا ملاحظاتك على تحسين CO·ONN.', 'متابعة', 'أدخل السبب.', 'اختر سببًا.', 'أدخل السبب.', 'جارٍ تحميل الأسباب.', 'تعذر تحميل الأسباب.', 'تأكيد أخير', 'سيتوقف الوصول إلى الحساب فورًا.', 'اكتب “{{keyword}}” أدناه.', 'حذف', 'حذف', 'حذف', 'تم إرسال طلب الحذف.', 'تعذر حذف الحساب.'],
  hi: ['खाता', 'खाता हटाएँ', 'अपना खाता और निजी डेटा हटाएँ।', 'आगे बढ़ने से पहले इन्हें पढ़ें।', 'आपकी प्रोफ़ाइल, दोस्त और सेटिंग हट जाएँगी।', 'कुछ चैट इतिहास अन्य लोगों के पास हटाए गए उपयोगकर्ता के रूप में रह सकता है।', 'आप 7 दिनों तक उसी खाते से दोबारा जुड़ नहीं सकते।', 'CO·ONN ID और friend code 30 दिनों तक फिर इस्तेमाल नहीं हो सकते।', 'मैंने सब पढ़ लिया है और आगे बढ़ना चाहता हूँ।', 'आगे', 'रद्द करें', 'हमें बताएं कि आप क्यों जा रहे हैं', 'आपकी प्रतिक्रिया CO·ONN को बेहतर बनाती है।', 'जारी रखें', 'कारण दर्ज करें।', 'एक कारण चुनें।', 'कारण दर्ज करें।', 'कारण लोड हो रहे हैं।', 'कारण लोड नहीं हो सके।', 'अंतिम पुष्टि', 'खाते की पहुँच तुरंत बंद हो जाएगी।', 'नीचे “{{keyword}}” लिखें।', 'हटाएँ', 'हटाएँ', 'हटाएँ', 'हटाने का अनुरोध भेजा गया।', 'खाता हटाया नहीं जा सका।']
};

const keys = ['entryTitle','entryDescription','noticeTitle','noticeMessage','noticeItemProfile','noticeItemChat','noticeItemRejoin','noticeItemIdentifier','noticeAcknowledge','continue','cancel','surveyTitle','surveyMessage','surveyAction','otherPlaceholder','reasonRequired','otherRequired','reasonsLoading','reasonsEmpty','confirmTitle','confirmMessage','confirmInstruction','confirmKeyword','confirmPlaceholder','confirmAction','completed','failed'];

for (const [lang, values] of Object.entries(englishBased)) {
  patches[lang] = {
    section: { account_management: values[0] },
    withdrawal: Object.fromEntries(keys.map((key, index) => [key, values[index + 1]]))
  };
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = merge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const root = process.cwd();
for (const [lang, patch] of Object.entries(patches)) {
  const file = path.join(root, 'src', 'locales', lang, 'settings.json');
  if (!fs.existsSync(file)) {
    console.warn(`skip ${lang}: ${file}`);
    continue;
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.account = merge(json.account || {}, patch);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`patched ${lang}`);
}
