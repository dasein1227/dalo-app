/*
  CO·ONN business i18n missing-key patch

  Usage:
    cd C:\\dalo-app
    New-Item -ItemType Directory -Force .\\scripts
    # copy this file to .\\scripts\\patch-business-i18n-full.js
    node .\\scripts\\patch-business-i18n-full.js
    npx tsc --noEmit
    npx expo start -c

  Policy:
    - Patches src/locales/{lang}/business.json for every supported language.
    - Does not overwrite existing non-empty values.
    - Adds missing/empty values only.
    - After patching, scans src TS/TSX files for t('business:...') keys and reports unresolved keys.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const LOCALE_ROOT = path.join(ROOT, 'src', 'locales');

const LANGS = [
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

/** @type {Record<string, Record<string, string>>} */
const PATCH = {
  ko: {
    'common.cancel': '취소',
    'common.delete': '삭제',
    'common.count': '{{count}}개',
    'common.saveDone': '저장되었습니다.',
    'common.editDone': '수정되었습니다.',

    'create.companySaved': '회사 정보가 저장되었습니다.',
    'create.saveFail': '저장하지 못했습니다.',
    'create.galleryPermission': '갤러리 접근 권한을 허용해 주세요.',
    'create.businessRequired': '먼저 비즈니스를 생성해 주세요.',
    'create.contentRequired': '사진이나 글을 입력해 주세요.',
    'create.imageUploadFail': '이미지 업로드 실패',
    'create.photoDeleteConfirm': '이 사진을 삭제할까요?',
    'create.photoDeleteFail': '사진을 삭제하지 못했습니다.',
    'create.photoEditDone': '사진이 수정되었습니다.',
    'create.photoCreateDone': '사진이 등록되었습니다.',
    'create.photoSaveFail': '사진을 저장하지 못했습니다.',
    'create.heroSelected': '대표 사진으로 설정되었습니다.\n상단 저장 버튼으로 확정해 주세요.',

    'info.aiGenerateDone': 'AI 브리핑이 생성되었습니다.',
    'info.aiGenerateFailed': 'AI 브리핑을 생성하지 못했습니다.',

    'menu.all': '전체',
    'menu.signature': '대표',

    'photos.editTitle': '사진 수정',
    'photos.newTitle': '새 사진',
    'photos.select': '사진 선택',
    'photos.captionPlaceholder': '사진 설명',
    'photos.submitEdit': '수정 완료',
    'photos.submitNew': '등록',
    'photos.viewerTitle': '사진',
    'photos.gridTitle': '등록된 사진',
    'photos.gridSubtitle': '대표 사진과 매장 사진을 관리합니다.',
    'photos.empty': '등록된 사진이 없습니다.',
    'photos.fetchFail': '사진을 불러오지 못했습니다.',
    'photos.contentRequired': '사진이나 설명을 입력해 주세요.',
    'photos.updateDone': '사진이 수정되었습니다.',
    'photos.createDone': '사진이 등록되었습니다.',
    'photos.saveFail': '사진을 저장하지 못했습니다.',
    'photos.deleteTitle': '사진 삭제',
    'photos.deleteConfirm': '이 사진을 삭제할까요?',
    'photos.deleteFail': '사진을 삭제하지 못했습니다.',

    'manager.photoAdd': '사진 추가',
    'manager.hero': '대표 사진',
    'manager.heroImageRequired': '이미지가 있는 사진만 대표 사진으로 설정할 수 있습니다.',
    'manager.heroSelectedTitle': '설정 완료',
    'manager.heroSelectedDesc': '대표 사진으로 선택되었습니다.\n상단 저장 버튼으로 확정해 주세요.',
    'manager.uploadFailImage': '이미지를 업로드하지 못했습니다.',
  },

  en: {
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.count': '{{count}}',
    'common.saveDone': 'Saved.',
    'common.editDone': 'Updated.',

    'create.companySaved': 'Company information saved.',
    'create.saveFail': 'Could not save.',
    'create.galleryPermission': 'Please allow gallery access.',
    'create.businessRequired': 'Create a business first.',
    'create.contentRequired': 'Add a photo or text.',
    'create.imageUploadFail': 'Image upload failed.',
    'create.photoDeleteConfirm': 'Delete this photo?',
    'create.photoDeleteFail': 'Could not delete the photo.',
    'create.photoEditDone': 'Photo updated.',
    'create.photoCreateDone': 'Photo added.',
    'create.photoSaveFail': 'Could not save the photo.',
    'create.heroSelected': 'Set as the main photo.\nTap Save at the top to confirm.',

    'info.aiGenerateDone': 'AI briefing created.',
    'info.aiGenerateFailed': 'Could not create the AI briefing.',

    'menu.all': 'All',
    'menu.signature': 'Signature',

    'photos.editTitle': 'Edit photo',
    'photos.newTitle': 'New photo',
    'photos.select': 'Select photo',
    'photos.captionPlaceholder': 'Photo caption',
    'photos.submitEdit': 'Update',
    'photos.submitNew': 'Add',
    'photos.viewerTitle': 'Photo',
    'photos.gridTitle': 'Photos',
    'photos.gridSubtitle': 'Manage the main photo and store photos.',
    'photos.empty': 'No photos yet.',
    'photos.fetchFail': 'Could not load photos.',
    'photos.contentRequired': 'Add a photo or caption.',
    'photos.updateDone': 'Photo updated.',
    'photos.createDone': 'Photo added.',
    'photos.saveFail': 'Could not save the photo.',
    'photos.deleteTitle': 'Delete photo',
    'photos.deleteConfirm': 'Delete this photo?',
    'photos.deleteFail': 'Could not delete the photo.',

    'manager.photoAdd': 'Add photo',
    'manager.hero': 'Main photo',
    'manager.heroImageRequired': 'Only photos with an image can be set as the main photo.',
    'manager.heroSelectedTitle': 'Set',
    'manager.heroSelectedDesc': 'Selected as the main photo.\nTap Save at the top to confirm.',
    'manager.uploadFailImage': 'Could not upload the image.',
  },

  ja: {
    'common.cancel': 'キャンセル',
    'common.delete': '削除',
    'common.count': '{{count}}件',
    'common.saveDone': '保存しました。',
    'common.editDone': '更新しました。',

    'create.companySaved': '会社情報を保存しました。',
    'create.saveFail': '保存できませんでした。',
    'create.galleryPermission': 'ギャラリーへのアクセスを許可してください。',
    'create.businessRequired': '先にビジネスを作成してください。',
    'create.contentRequired': '写真またはテキストを入力してください。',
    'create.imageUploadFail': '画像のアップロードに失敗しました。',
    'create.photoDeleteConfirm': 'この写真を削除しますか？',
    'create.photoDeleteFail': '写真を削除できませんでした。',
    'create.photoEditDone': '写真を更新しました。',
    'create.photoCreateDone': '写真を追加しました。',
    'create.photoSaveFail': '写真を保存できませんでした。',
    'create.heroSelected': 'メイン写真に設定しました。\n上部の保存ボタンで確定してください。',

    'info.aiGenerateDone': 'AIブリーフィングを作成しました。',
    'info.aiGenerateFailed': 'AIブリーフィングを作成できませんでした。',

    'menu.all': 'すべて',
    'menu.signature': '代表',

    'photos.editTitle': '写真を編集',
    'photos.newTitle': '新しい写真',
    'photos.select': '写真を選択',
    'photos.captionPlaceholder': '写真の説明',
    'photos.submitEdit': '更新',
    'photos.submitNew': '登録',
    'photos.viewerTitle': '写真',
    'photos.gridTitle': '登録済み写真',
    'photos.gridSubtitle': 'メイン写真と店舗写真を管理します。',
    'photos.empty': '登録された写真はありません。',
    'photos.fetchFail': '写真を読み込めませんでした。',
    'photos.contentRequired': '写真または説明を入力してください。',
    'photos.updateDone': '写真を更新しました。',
    'photos.createDone': '写真を追加しました。',
    'photos.saveFail': '写真を保存できませんでした。',
    'photos.deleteTitle': '写真を削除',
    'photos.deleteConfirm': 'この写真を削除しますか？',
    'photos.deleteFail': '写真を削除できませんでした。',

    'manager.photoAdd': '写真を追加',
    'manager.hero': 'メイン写真',
    'manager.heroImageRequired': '画像のある写真のみメイン写真に設定できます。',
    'manager.heroSelectedTitle': '設定完了',
    'manager.heroSelectedDesc': 'メイン写真として選択しました。\n上部の保存ボタンで確定してください。',
    'manager.uploadFailImage': '画像をアップロードできませんでした。',
  },

  'zh-Hans': {
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.count': '{{count}}个',
    'common.saveDone': '已保存。',
    'common.editDone': '已更新。',

    'create.companySaved': '公司信息已保存。',
    'create.saveFail': '无法保存。',
    'create.galleryPermission': '请允许访问相册。',
    'create.businessRequired': '请先创建商家。',
    'create.contentRequired': '请添加照片或文字。',
    'create.imageUploadFail': '图片上传失败。',
    'create.photoDeleteConfirm': '要删除这张照片吗？',
    'create.photoDeleteFail': '无法删除照片。',
    'create.photoEditDone': '照片已更新。',
    'create.photoCreateDone': '照片已添加。',
    'create.photoSaveFail': '无法保存照片。',
    'create.heroSelected': '已设为主照片。\n请点击顶部保存确认。',

    'info.aiGenerateDone': 'AI 简报已生成。',
    'info.aiGenerateFailed': '无法生成 AI 简报。',

    'menu.all': '全部',
    'menu.signature': '招牌',

    'photos.editTitle': '编辑照片',
    'photos.newTitle': '新照片',
    'photos.select': '选择照片',
    'photos.captionPlaceholder': '照片说明',
    'photos.submitEdit': '更新',
    'photos.submitNew': '添加',
    'photos.viewerTitle': '照片',
    'photos.gridTitle': '已上传照片',
    'photos.gridSubtitle': '管理主照片和店铺照片。',
    'photos.empty': '还没有照片。',
    'photos.fetchFail': '无法加载照片。',
    'photos.contentRequired': '请添加照片或说明。',
    'photos.updateDone': '照片已更新。',
    'photos.createDone': '照片已添加。',
    'photos.saveFail': '无法保存照片。',
    'photos.deleteTitle': '删除照片',
    'photos.deleteConfirm': '要删除这张照片吗？',
    'photos.deleteFail': '无法删除照片。',

    'manager.photoAdd': '添加照片',
    'manager.hero': '主照片',
    'manager.heroImageRequired': '只有包含图片的照片可设为主照片。',
    'manager.heroSelectedTitle': '已设置',
    'manager.heroSelectedDesc': '已选择为主照片。\n请点击顶部保存确认。',
    'manager.uploadFailImage': '无法上传图片。',
  },

  'zh-Hant': {
    'common.cancel': '取消',
    'common.delete': '刪除',
    'common.count': '{{count}}個',
    'common.saveDone': '已儲存。',
    'common.editDone': '已更新。',

    'create.companySaved': '公司資訊已儲存。',
    'create.saveFail': '無法儲存。',
    'create.galleryPermission': '請允許存取相簿。',
    'create.businessRequired': '請先建立商家。',
    'create.contentRequired': '請加入照片或文字。',
    'create.imageUploadFail': '圖片上傳失敗。',
    'create.photoDeleteConfirm': '要刪除這張照片嗎？',
    'create.photoDeleteFail': '無法刪除照片。',
    'create.photoEditDone': '照片已更新。',
    'create.photoCreateDone': '照片已新增。',
    'create.photoSaveFail': '無法儲存照片。',
    'create.heroSelected': '已設為主照片。\n請點選上方儲存確認。',

    'info.aiGenerateDone': 'AI 簡報已產生。',
    'info.aiGenerateFailed': '無法產生 AI 簡報。',

    'menu.all': '全部',
    'menu.signature': '招牌',

    'photos.editTitle': '編輯照片',
    'photos.newTitle': '新照片',
    'photos.select': '選擇照片',
    'photos.captionPlaceholder': '照片說明',
    'photos.submitEdit': '更新',
    'photos.submitNew': '新增',
    'photos.viewerTitle': '照片',
    'photos.gridTitle': '已上傳照片',
    'photos.gridSubtitle': '管理主照片與店鋪照片。',
    'photos.empty': '尚無照片。',
    'photos.fetchFail': '無法載入照片。',
    'photos.contentRequired': '請加入照片或說明。',
    'photos.updateDone': '照片已更新。',
    'photos.createDone': '照片已新增。',
    'photos.saveFail': '無法儲存照片。',
    'photos.deleteTitle': '刪除照片',
    'photos.deleteConfirm': '要刪除這張照片嗎？',
    'photos.deleteFail': '無法刪除照片。',

    'manager.photoAdd': '新增照片',
    'manager.hero': '主照片',
    'manager.heroImageRequired': '只有包含圖片的照片可設為主照片。',
    'manager.heroSelectedTitle': '已設定',
    'manager.heroSelectedDesc': '已選為主照片。\n請點選上方儲存確認。',
    'manager.uploadFailImage': '無法上傳圖片。',
  },

  es: {
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.count': '{{count}}',
    'common.saveDone': 'Guardado.',
    'common.editDone': 'Actualizado.',

    'create.companySaved': 'Información de la empresa guardada.',
    'create.saveFail': 'No se pudo guardar.',
    'create.galleryPermission': 'Permite el acceso a la galería.',
    'create.businessRequired': 'Crea un negocio primero.',
    'create.contentRequired': 'Añade una foto o texto.',
    'create.imageUploadFail': 'No se pudo subir la imagen.',
    'create.photoDeleteConfirm': '¿Eliminar esta foto?',
    'create.photoDeleteFail': 'No se pudo eliminar la foto.',
    'create.photoEditDone': 'Foto actualizada.',
    'create.photoCreateDone': 'Foto añadida.',
    'create.photoSaveFail': 'No se pudo guardar la foto.',
    'create.heroSelected': 'Establecida como foto principal.\nToca Guardar arriba para confirmar.',

    'info.aiGenerateDone': 'Resumen de IA creado.',
    'info.aiGenerateFailed': 'No se pudo crear el resumen de IA.',

    'menu.all': 'Todo',
    'menu.signature': 'Destacado',

    'photos.editTitle': 'Editar foto',
    'photos.newTitle': 'Nueva foto',
    'photos.select': 'Seleccionar foto',
    'photos.captionPlaceholder': 'Descripción de la foto',
    'photos.submitEdit': 'Actualizar',
    'photos.submitNew': 'Añadir',
    'photos.viewerTitle': 'Foto',
    'photos.gridTitle': 'Fotos',
    'photos.gridSubtitle': 'Gestiona la foto principal y las fotos del local.',
    'photos.empty': 'Aún no hay fotos.',
    'photos.fetchFail': 'No se pudieron cargar las fotos.',
    'photos.contentRequired': 'Añade una foto o descripción.',
    'photos.updateDone': 'Foto actualizada.',
    'photos.createDone': 'Foto añadida.',
    'photos.saveFail': 'No se pudo guardar la foto.',
    'photos.deleteTitle': 'Eliminar foto',
    'photos.deleteConfirm': '¿Eliminar esta foto?',
    'photos.deleteFail': 'No se pudo eliminar la foto.',

    'manager.photoAdd': 'Añadir foto',
    'manager.hero': 'Foto principal',
    'manager.heroImageRequired': 'Solo las fotos con imagen pueden ser foto principal.',
    'manager.heroSelectedTitle': 'Configurado',
    'manager.heroSelectedDesc': 'Seleccionada como foto principal.\nToca Guardar arriba para confirmar.',
    'manager.uploadFailImage': 'No se pudo subir la imagen.',
  },

  fr: {
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.count': '{{count}}',
    'common.saveDone': 'Enregistré.',
    'common.editDone': 'Mis à jour.',

    'create.companySaved': 'Informations de l’entreprise enregistrées.',
    'create.saveFail': 'Impossible d’enregistrer.',
    'create.galleryPermission': 'Autorisez l’accès à la galerie.',
    'create.businessRequired': 'Créez d’abord une entreprise.',
    'create.contentRequired': 'Ajoutez une photo ou du texte.',
    'create.imageUploadFail': 'Échec de l’import de l’image.',
    'create.photoDeleteConfirm': 'Supprimer cette photo ?',
    'create.photoDeleteFail': 'Impossible de supprimer la photo.',
    'create.photoEditDone': 'Photo mise à jour.',
    'create.photoCreateDone': 'Photo ajoutée.',
    'create.photoSaveFail': 'Impossible d’enregistrer la photo.',
    'create.heroSelected': 'Définie comme photo principale.\nTouchez Enregistrer en haut pour confirmer.',

    'info.aiGenerateDone': 'Briefing IA créé.',
    'info.aiGenerateFailed': 'Impossible de créer le briefing IA.',

    'menu.all': 'Tout',
    'menu.signature': 'Signature',

    'photos.editTitle': 'Modifier la photo',
    'photos.newTitle': 'Nouvelle photo',
    'photos.select': 'Choisir une photo',
    'photos.captionPlaceholder': 'Légende de la photo',
    'photos.submitEdit': 'Mettre à jour',
    'photos.submitNew': 'Ajouter',
    'photos.viewerTitle': 'Photo',
    'photos.gridTitle': 'Photos',
    'photos.gridSubtitle': 'Gérez la photo principale et les photos du lieu.',
    'photos.empty': 'Aucune photo pour le moment.',
    'photos.fetchFail': 'Impossible de charger les photos.',
    'photos.contentRequired': 'Ajoutez une photo ou une légende.',
    'photos.updateDone': 'Photo mise à jour.',
    'photos.createDone': 'Photo ajoutée.',
    'photos.saveFail': 'Impossible d’enregistrer la photo.',
    'photos.deleteTitle': 'Supprimer la photo',
    'photos.deleteConfirm': 'Supprimer cette photo ?',
    'photos.deleteFail': 'Impossible de supprimer la photo.',

    'manager.photoAdd': 'Ajouter une photo',
    'manager.hero': 'Photo principale',
    'manager.heroImageRequired': 'Seules les photos avec image peuvent être définies comme photo principale.',
    'manager.heroSelectedTitle': 'Défini',
    'manager.heroSelectedDesc': 'Sélectionnée comme photo principale.\nTouchez Enregistrer en haut pour confirmer.',
    'manager.uploadFailImage': 'Impossible d’importer l’image.',
  },

  de: {
    'common.cancel': 'Abbrechen',
    'common.delete': 'Löschen',
    'common.count': '{{count}}',
    'common.saveDone': 'Gespeichert.',
    'common.editDone': 'Aktualisiert.',

    'create.companySaved': 'Unternehmensdaten gespeichert.',
    'create.saveFail': 'Speichern fehlgeschlagen.',
    'create.galleryPermission': 'Bitte Zugriff auf die Galerie erlauben.',
    'create.businessRequired': 'Erstelle zuerst ein Business.',
    'create.contentRequired': 'Füge ein Foto oder Text hinzu.',
    'create.imageUploadFail': 'Bild-Upload fehlgeschlagen.',
    'create.photoDeleteConfirm': 'Dieses Foto löschen?',
    'create.photoDeleteFail': 'Foto konnte nicht gelöscht werden.',
    'create.photoEditDone': 'Foto aktualisiert.',
    'create.photoCreateDone': 'Foto hinzugefügt.',
    'create.photoSaveFail': 'Foto konnte nicht gespeichert werden.',
    'create.heroSelected': 'Als Hauptfoto festgelegt.\nOben auf Speichern tippen, um zu bestätigen.',

    'info.aiGenerateDone': 'KI-Briefing erstellt.',
    'info.aiGenerateFailed': 'KI-Briefing konnte nicht erstellt werden.',

    'menu.all': 'Alle',
    'menu.signature': 'Signatur',

    'photos.editTitle': 'Foto bearbeiten',
    'photos.newTitle': 'Neues Foto',
    'photos.select': 'Foto auswählen',
    'photos.captionPlaceholder': 'Fotobeschreibung',
    'photos.submitEdit': 'Aktualisieren',
    'photos.submitNew': 'Hinzufügen',
    'photos.viewerTitle': 'Foto',
    'photos.gridTitle': 'Fotos',
    'photos.gridSubtitle': 'Verwalte Hauptfoto und Fotos des Geschäfts.',
    'photos.empty': 'Noch keine Fotos vorhanden.',
    'photos.fetchFail': 'Fotos konnten nicht geladen werden.',
    'photos.contentRequired': 'Füge ein Foto oder eine Beschreibung hinzu.',
    'photos.updateDone': 'Foto aktualisiert.',
    'photos.createDone': 'Foto hinzugefügt.',
    'photos.saveFail': 'Foto konnte nicht gespeichert werden.',
    'photos.deleteTitle': 'Foto löschen',
    'photos.deleteConfirm': 'Dieses Foto löschen?',
    'photos.deleteFail': 'Foto konnte nicht gelöscht werden.',

    'manager.photoAdd': 'Foto hinzufügen',
    'manager.hero': 'Hauptfoto',
    'manager.heroImageRequired': 'Nur Fotos mit Bild können als Hauptfoto festgelegt werden.',
    'manager.heroSelectedTitle': 'Festgelegt',
    'manager.heroSelectedDesc': 'Als Hauptfoto ausgewählt.\nOben auf Speichern tippen, um zu bestätigen.',
    'manager.uploadFailImage': 'Bild konnte nicht hochgeladen werden.',
  },

  pt: {
    'common.cancel': 'Cancelar',
    'common.delete': 'Excluir',
    'common.count': '{{count}}',
    'common.saveDone': 'Salvo.',
    'common.editDone': 'Atualizado.',

    'create.companySaved': 'Informações da empresa salvas.',
    'create.saveFail': 'Não foi possível salvar.',
    'create.galleryPermission': 'Permita o acesso à galeria.',
    'create.businessRequired': 'Crie um negócio primeiro.',
    'create.contentRequired': 'Adicione uma foto ou texto.',
    'create.imageUploadFail': 'Falha ao enviar a imagem.',
    'create.photoDeleteConfirm': 'Excluir esta foto?',
    'create.photoDeleteFail': 'Não foi possível excluir a foto.',
    'create.photoEditDone': 'Foto atualizada.',
    'create.photoCreateDone': 'Foto adicionada.',
    'create.photoSaveFail': 'Não foi possível salvar a foto.',
    'create.heroSelected': 'Definida como foto principal.\nToque em Salvar no topo para confirmar.',

    'info.aiGenerateDone': 'Briefing de IA criado.',
    'info.aiGenerateFailed': 'Não foi possível criar o briefing de IA.',

    'menu.all': 'Tudo',
    'menu.signature': 'Destaque',

    'photos.editTitle': 'Editar foto',
    'photos.newTitle': 'Nova foto',
    'photos.select': 'Selecionar foto',
    'photos.captionPlaceholder': 'Legenda da foto',
    'photos.submitEdit': 'Atualizar',
    'photos.submitNew': 'Adicionar',
    'photos.viewerTitle': 'Foto',
    'photos.gridTitle': 'Fotos',
    'photos.gridSubtitle': 'Gerencie a foto principal e as fotos da loja.',
    'photos.empty': 'Ainda não há fotos.',
    'photos.fetchFail': 'Não foi possível carregar as fotos.',
    'photos.contentRequired': 'Adicione uma foto ou legenda.',
    'photos.updateDone': 'Foto atualizada.',
    'photos.createDone': 'Foto adicionada.',
    'photos.saveFail': 'Não foi possível salvar a foto.',
    'photos.deleteTitle': 'Excluir foto',
    'photos.deleteConfirm': 'Excluir esta foto?',
    'photos.deleteFail': 'Não foi possível excluir a foto.',

    'manager.photoAdd': 'Adicionar foto',
    'manager.hero': 'Foto principal',
    'manager.heroImageRequired': 'Só fotos com imagem podem ser definidas como foto principal.',
    'manager.heroSelectedTitle': 'Definido',
    'manager.heroSelectedDesc': 'Selecionada como foto principal.\nToque em Salvar no topo para confirmar.',
    'manager.uploadFailImage': 'Não foi possível enviar a imagem.',
  },

  it: {
    'common.cancel': 'Annulla',
    'common.delete': 'Elimina',
    'common.count': '{{count}}',
    'common.saveDone': 'Salvato.',
    'common.editDone': 'Aggiornato.',

    'create.companySaved': 'Informazioni aziendali salvate.',
    'create.saveFail': 'Impossibile salvare.',
    'create.galleryPermission': 'Consenti l’accesso alla galleria.',
    'create.businessRequired': 'Crea prima un’attività.',
    'create.contentRequired': 'Aggiungi una foto o un testo.',
    'create.imageUploadFail': 'Caricamento immagine non riuscito.',
    'create.photoDeleteConfirm': 'Eliminare questa foto?',
    'create.photoDeleteFail': 'Impossibile eliminare la foto.',
    'create.photoEditDone': 'Foto aggiornata.',
    'create.photoCreateDone': 'Foto aggiunta.',
    'create.photoSaveFail': 'Impossibile salvare la foto.',
    'create.heroSelected': 'Impostata come foto principale.\nTocca Salva in alto per confermare.',

    'info.aiGenerateDone': 'Briefing AI creato.',
    'info.aiGenerateFailed': 'Impossibile creare il briefing AI.',

    'menu.all': 'Tutto',
    'menu.signature': 'In evidenza',

    'photos.editTitle': 'Modifica foto',
    'photos.newTitle': 'Nuova foto',
    'photos.select': 'Seleziona foto',
    'photos.captionPlaceholder': 'Didascalia foto',
    'photos.submitEdit': 'Aggiorna',
    'photos.submitNew': 'Aggiungi',
    'photos.viewerTitle': 'Foto',
    'photos.gridTitle': 'Foto',
    'photos.gridSubtitle': 'Gestisci la foto principale e le foto del locale.',
    'photos.empty': 'Nessuna foto ancora.',
    'photos.fetchFail': 'Impossibile caricare le foto.',
    'photos.contentRequired': 'Aggiungi una foto o una descrizione.',
    'photos.updateDone': 'Foto aggiornata.',
    'photos.createDone': 'Foto aggiunta.',
    'photos.saveFail': 'Impossibile salvare la foto.',
    'photos.deleteTitle': 'Elimina foto',
    'photos.deleteConfirm': 'Eliminare questa foto?',
    'photos.deleteFail': 'Impossibile eliminare la foto.',

    'manager.photoAdd': 'Aggiungi foto',
    'manager.hero': 'Foto principale',
    'manager.heroImageRequired': 'Solo le foto con immagine possono essere impostate come foto principale.',
    'manager.heroSelectedTitle': 'Impostata',
    'manager.heroSelectedDesc': 'Selezionata come foto principale.\nTocca Salva in alto per confermare.',
    'manager.uploadFailImage': 'Impossibile caricare l’immagine.',
  },

  id: {
    'common.cancel': 'Batal',
    'common.delete': 'Hapus',
    'common.count': '{{count}}',
    'common.saveDone': 'Tersimpan.',
    'common.editDone': 'Diperbarui.',

    'create.companySaved': 'Informasi perusahaan tersimpan.',
    'create.saveFail': 'Tidak dapat menyimpan.',
    'create.galleryPermission': 'Izinkan akses galeri.',
    'create.businessRequired': 'Buat bisnis terlebih dahulu.',
    'create.contentRequired': 'Tambahkan foto atau teks.',
    'create.imageUploadFail': 'Gagal mengunggah gambar.',
    'create.photoDeleteConfirm': 'Hapus foto ini?',
    'create.photoDeleteFail': 'Tidak dapat menghapus foto.',
    'create.photoEditDone': 'Foto diperbarui.',
    'create.photoCreateDone': 'Foto ditambahkan.',
    'create.photoSaveFail': 'Tidak dapat menyimpan foto.',
    'create.heroSelected': 'Ditetapkan sebagai foto utama.\nKetuk Simpan di atas untuk mengonfirmasi.',

    'info.aiGenerateDone': 'Ringkasan AI dibuat.',
    'info.aiGenerateFailed': 'Tidak dapat membuat ringkasan AI.',

    'menu.all': 'Semua',
    'menu.signature': 'Unggulan',

    'photos.editTitle': 'Edit foto',
    'photos.newTitle': 'Foto baru',
    'photos.select': 'Pilih foto',
    'photos.captionPlaceholder': 'Keterangan foto',
    'photos.submitEdit': 'Perbarui',
    'photos.submitNew': 'Tambah',
    'photos.viewerTitle': 'Foto',
    'photos.gridTitle': 'Foto',
    'photos.gridSubtitle': 'Kelola foto utama dan foto toko.',
    'photos.empty': 'Belum ada foto.',
    'photos.fetchFail': 'Tidak dapat memuat foto.',
    'photos.contentRequired': 'Tambahkan foto atau keterangan.',
    'photos.updateDone': 'Foto diperbarui.',
    'photos.createDone': 'Foto ditambahkan.',
    'photos.saveFail': 'Tidak dapat menyimpan foto.',
    'photos.deleteTitle': 'Hapus foto',
    'photos.deleteConfirm': 'Hapus foto ini?',
    'photos.deleteFail': 'Tidak dapat menghapus foto.',

    'manager.photoAdd': 'Tambah foto',
    'manager.hero': 'Foto utama',
    'manager.heroImageRequired': 'Hanya foto bergambar yang dapat dijadikan foto utama.',
    'manager.heroSelectedTitle': 'Ditetapkan',
    'manager.heroSelectedDesc': 'Dipilih sebagai foto utama.\nKetuk Simpan di atas untuk mengonfirmasi.',
    'manager.uploadFailImage': 'Tidak dapat mengunggah gambar.',
  },

  vi: {
    'common.cancel': 'Hủy',
    'common.delete': 'Xóa',
    'common.count': '{{count}}',
    'common.saveDone': 'Đã lưu.',
    'common.editDone': 'Đã cập nhật.',

    'create.companySaved': 'Đã lưu thông tin công ty.',
    'create.saveFail': 'Không thể lưu.',
    'create.galleryPermission': 'Vui lòng cho phép truy cập thư viện ảnh.',
    'create.businessRequired': 'Hãy tạo doanh nghiệp trước.',
    'create.contentRequired': 'Thêm ảnh hoặc nội dung.',
    'create.imageUploadFail': 'Tải ảnh lên thất bại.',
    'create.photoDeleteConfirm': 'Xóa ảnh này?',
    'create.photoDeleteFail': 'Không thể xóa ảnh.',
    'create.photoEditDone': 'Đã cập nhật ảnh.',
    'create.photoCreateDone': 'Đã thêm ảnh.',
    'create.photoSaveFail': 'Không thể lưu ảnh.',
    'create.heroSelected': 'Đã đặt làm ảnh chính.\nNhấn Lưu ở trên để xác nhận.',

    'info.aiGenerateDone': 'Đã tạo bản tóm tắt AI.',
    'info.aiGenerateFailed': 'Không thể tạo bản tóm tắt AI.',

    'menu.all': 'Tất cả',
    'menu.signature': 'Nổi bật',

    'photos.editTitle': 'Sửa ảnh',
    'photos.newTitle': 'Ảnh mới',
    'photos.select': 'Chọn ảnh',
    'photos.captionPlaceholder': 'Mô tả ảnh',
    'photos.submitEdit': 'Cập nhật',
    'photos.submitNew': 'Thêm',
    'photos.viewerTitle': 'Ảnh',
    'photos.gridTitle': 'Ảnh đã đăng',
    'photos.gridSubtitle': 'Quản lý ảnh chính và ảnh cửa hàng.',
    'photos.empty': 'Chưa có ảnh.',
    'photos.fetchFail': 'Không thể tải ảnh.',
    'photos.contentRequired': 'Thêm ảnh hoặc mô tả.',
    'photos.updateDone': 'Đã cập nhật ảnh.',
    'photos.createDone': 'Đã thêm ảnh.',
    'photos.saveFail': 'Không thể lưu ảnh.',
    'photos.deleteTitle': 'Xóa ảnh',
    'photos.deleteConfirm': 'Xóa ảnh này?',
    'photos.deleteFail': 'Không thể xóa ảnh.',

    'manager.photoAdd': 'Thêm ảnh',
    'manager.hero': 'Ảnh chính',
    'manager.heroImageRequired': 'Chỉ ảnh có hình mới có thể đặt làm ảnh chính.',
    'manager.heroSelectedTitle': 'Đã đặt',
    'manager.heroSelectedDesc': 'Đã chọn làm ảnh chính.\nNhấn Lưu ở trên để xác nhận.',
    'manager.uploadFailImage': 'Không thể tải ảnh lên.',
  },

  th: {
    'common.cancel': 'ยกเลิก',
    'common.delete': 'ลบ',
    'common.count': '{{count}}',
    'common.saveDone': 'บันทึกแล้ว',
    'common.editDone': 'อัปเดตแล้ว',

    'create.companySaved': 'บันทึกข้อมูลบริษัทแล้ว',
    'create.saveFail': 'ไม่สามารถบันทึกได้',
    'create.galleryPermission': 'โปรดอนุญาตให้เข้าถึงแกลเลอรี',
    'create.businessRequired': 'โปรดสร้างธุรกิจก่อน',
    'create.contentRequired': 'เพิ่มรูปภาพหรือข้อความ',
    'create.imageUploadFail': 'อัปโหลดรูปภาพไม่สำเร็จ',
    'create.photoDeleteConfirm': 'ลบรูปภาพนี้ไหม?',
    'create.photoDeleteFail': 'ไม่สามารถลบรูปภาพได้',
    'create.photoEditDone': 'อัปเดตรูปภาพแล้ว',
    'create.photoCreateDone': 'เพิ่มรูปภาพแล้ว',
    'create.photoSaveFail': 'ไม่สามารถบันทึกรูปภาพได้',
    'create.heroSelected': 'ตั้งเป็นรูปหลักแล้ว\nแตะบันทึกด้านบนเพื่อยืนยัน',

    'info.aiGenerateDone': 'สร้างสรุป AI แล้ว',
    'info.aiGenerateFailed': 'ไม่สามารถสร้างสรุป AI ได้',

    'menu.all': 'ทั้งหมด',
    'menu.signature': 'แนะนำ',

    'photos.editTitle': 'แก้ไขรูปภาพ',
    'photos.newTitle': 'รูปภาพใหม่',
    'photos.select': 'เลือกรูปภาพ',
    'photos.captionPlaceholder': 'คำอธิบายรูปภาพ',
    'photos.submitEdit': 'อัปเดต',
    'photos.submitNew': 'เพิ่ม',
    'photos.viewerTitle': 'รูปภาพ',
    'photos.gridTitle': 'รูปภาพ',
    'photos.gridSubtitle': 'จัดการรูปหลักและรูปภาพร้าน',
    'photos.empty': 'ยังไม่มีรูปภาพ',
    'photos.fetchFail': 'ไม่สามารถโหลดรูปภาพได้',
    'photos.contentRequired': 'เพิ่มรูปภาพหรือคำอธิบาย',
    'photos.updateDone': 'อัปเดตรูปภาพแล้ว',
    'photos.createDone': 'เพิ่มรูปภาพแล้ว',
    'photos.saveFail': 'ไม่สามารถบันทึกรูปภาพได้',
    'photos.deleteTitle': 'ลบรูปภาพ',
    'photos.deleteConfirm': 'ลบรูปภาพนี้ไหม?',
    'photos.deleteFail': 'ไม่สามารถลบรูปภาพได้',

    'manager.photoAdd': 'เพิ่มรูปภาพ',
    'manager.hero': 'รูปหลัก',
    'manager.heroImageRequired': 'ตั้งเป็นรูปหลักได้เฉพาะรายการที่มีรูปภาพเท่านั้น',
    'manager.heroSelectedTitle': 'ตั้งค่าแล้ว',
    'manager.heroSelectedDesc': 'เลือกเป็นรูปหลักแล้ว\nแตะบันทึกด้านบนเพื่อยืนยัน',
    'manager.uploadFailImage': 'ไม่สามารถอัปโหลดรูปภาพได้',
  },

  tr: {
    'common.cancel': 'İptal',
    'common.delete': 'Sil',
    'common.count': '{{count}}',
    'common.saveDone': 'Kaydedildi.',
    'common.editDone': 'Güncellendi.',

    'create.companySaved': 'Şirket bilgileri kaydedildi.',
    'create.saveFail': 'Kaydedilemedi.',
    'create.galleryPermission': 'Lütfen galeri erişimine izin verin.',
    'create.businessRequired': 'Önce bir işletme oluşturun.',
    'create.contentRequired': 'Bir fotoğraf veya metin ekleyin.',
    'create.imageUploadFail': 'Görsel yükleme başarısız.',
    'create.photoDeleteConfirm': 'Bu fotoğraf silinsin mi?',
    'create.photoDeleteFail': 'Fotoğraf silinemedi.',
    'create.photoEditDone': 'Fotoğraf güncellendi.',
    'create.photoCreateDone': 'Fotoğraf eklendi.',
    'create.photoSaveFail': 'Fotoğraf kaydedilemedi.',
    'create.heroSelected': 'Ana fotoğraf olarak ayarlandı.\nOnaylamak için üstteki Kaydet’e dokunun.',

    'info.aiGenerateDone': 'AI özeti oluşturuldu.',
    'info.aiGenerateFailed': 'AI özeti oluşturulamadı.',

    'menu.all': 'Tümü',
    'menu.signature': 'Öne çıkan',

    'photos.editTitle': 'Fotoğrafı düzenle',
    'photos.newTitle': 'Yeni fotoğraf',
    'photos.select': 'Fotoğraf seç',
    'photos.captionPlaceholder': 'Fotoğraf açıklaması',
    'photos.submitEdit': 'Güncelle',
    'photos.submitNew': 'Ekle',
    'photos.viewerTitle': 'Fotoğraf',
    'photos.gridTitle': 'Fotoğraflar',
    'photos.gridSubtitle': 'Ana fotoğrafı ve işletme fotoğraflarını yönetin.',
    'photos.empty': 'Henüz fotoğraf yok.',
    'photos.fetchFail': 'Fotoğraflar yüklenemedi.',
    'photos.contentRequired': 'Fotoğraf veya açıklama ekleyin.',
    'photos.updateDone': 'Fotoğraf güncellendi.',
    'photos.createDone': 'Fotoğraf eklendi.',
    'photos.saveFail': 'Fotoğraf kaydedilemedi.',
    'photos.deleteTitle': 'Fotoğrafı sil',
    'photos.deleteConfirm': 'Bu fotoğraf silinsin mi?',
    'photos.deleteFail': 'Fotoğraf silinemedi.',

    'manager.photoAdd': 'Fotoğraf ekle',
    'manager.hero': 'Ana fotoğraf',
    'manager.heroImageRequired': 'Yalnızca görseli olan fotoğraflar ana fotoğraf yapılabilir.',
    'manager.heroSelectedTitle': 'Ayarlandı',
    'manager.heroSelectedDesc': 'Ana fotoğraf olarak seçildi.\nOnaylamak için üstteki Kaydet’e dokunun.',
    'manager.uploadFailImage': 'Görsel yüklenemedi.',
  },

  ru: {
    'common.cancel': 'Отмена',
    'common.delete': 'Удалить',
    'common.count': '{{count}}',
    'common.saveDone': 'Сохранено.',
    'common.editDone': 'Обновлено.',

    'create.companySaved': 'Данные компании сохранены.',
    'create.saveFail': 'Не удалось сохранить.',
    'create.galleryPermission': 'Разрешите доступ к галерее.',
    'create.businessRequired': 'Сначала создайте бизнес.',
    'create.contentRequired': 'Добавьте фото или текст.',
    'create.imageUploadFail': 'Не удалось загрузить изображение.',
    'create.photoDeleteConfirm': 'Удалить это фото?',
    'create.photoDeleteFail': 'Не удалось удалить фото.',
    'create.photoEditDone': 'Фото обновлено.',
    'create.photoCreateDone': 'Фото добавлено.',
    'create.photoSaveFail': 'Не удалось сохранить фото.',
    'create.heroSelected': 'Установлено как главное фото.\nНажмите «Сохранить» вверху для подтверждения.',

    'info.aiGenerateDone': 'AI-брифинг создан.',
    'info.aiGenerateFailed': 'Не удалось создать AI-брифинг.',

    'menu.all': 'Все',
    'menu.signature': 'Фирменное',

    'photos.editTitle': 'Редактировать фото',
    'photos.newTitle': 'Новое фото',
    'photos.select': 'Выбрать фото',
    'photos.captionPlaceholder': 'Описание фото',
    'photos.submitEdit': 'Обновить',
    'photos.submitNew': 'Добавить',
    'photos.viewerTitle': 'Фото',
    'photos.gridTitle': 'Фотографии',
    'photos.gridSubtitle': 'Управляйте главным фото и фотографиями заведения.',
    'photos.empty': 'Фотографий пока нет.',
    'photos.fetchFail': 'Не удалось загрузить фотографии.',
    'photos.contentRequired': 'Добавьте фото или описание.',
    'photos.updateDone': 'Фото обновлено.',
    'photos.createDone': 'Фото добавлено.',
    'photos.saveFail': 'Не удалось сохранить фото.',
    'photos.deleteTitle': 'Удалить фото',
    'photos.deleteConfirm': 'Удалить это фото?',
    'photos.deleteFail': 'Не удалось удалить фото.',

    'manager.photoAdd': 'Добавить фото',
    'manager.hero': 'Главное фото',
    'manager.heroImageRequired': 'Главным можно сделать только фото с изображением.',
    'manager.heroSelectedTitle': 'Установлено',
    'manager.heroSelectedDesc': 'Выбрано как главное фото.\nНажмите «Сохранить» вверху для подтверждения.',
    'manager.uploadFailImage': 'Не удалось загрузить изображение.',
  },

  hi: {
    'common.cancel': 'रद्द करें',
    'common.delete': 'हटाएँ',
    'common.count': '{{count}}',
    'common.saveDone': 'सेव हो गया।',
    'common.editDone': 'अपडेट हो गया।',

    'create.companySaved': 'कंपनी की जानकारी सेव हो गई।',
    'create.saveFail': 'सेव नहीं हो सका।',
    'create.galleryPermission': 'कृपया गैलरी एक्सेस की अनुमति दें।',
    'create.businessRequired': 'पहले बिज़नेस बनाएँ।',
    'create.contentRequired': 'फोटो या टेक्स्ट जोड़ें।',
    'create.imageUploadFail': 'इमेज अपलोड विफल रहा।',
    'create.photoDeleteConfirm': 'यह फोटो हटाएँ?',
    'create.photoDeleteFail': 'फोटो हटाई नहीं जा सकी।',
    'create.photoEditDone': 'फोटो अपडेट हो गई।',
    'create.photoCreateDone': 'फोटो जोड़ दी गई।',
    'create.photoSaveFail': 'फोटो सेव नहीं हो सकी।',
    'create.heroSelected': 'मुख्य फोटो के रूप में सेट किया गया।\nपुष्टि के लिए ऊपर सेव पर टैप करें।',

    'info.aiGenerateDone': 'AI ब्रीफिंग बन गई।',
    'info.aiGenerateFailed': 'AI ब्रीफिंग नहीं बन सकी।',

    'menu.all': 'सभी',
    'menu.signature': 'विशेष',

    'photos.editTitle': 'फोटो संपादित करें',
    'photos.newTitle': 'नई फोटो',
    'photos.select': 'फोटो चुनें',
    'photos.captionPlaceholder': 'फोटो कैप्शन',
    'photos.submitEdit': 'अपडेट',
    'photos.submitNew': 'जोड़ें',
    'photos.viewerTitle': 'फोटो',
    'photos.gridTitle': 'फोटो',
    'photos.gridSubtitle': 'मुख्य फोटो और स्टोर फोटो प्रबंधित करें।',
    'photos.empty': 'अभी कोई फोटो नहीं है।',
    'photos.fetchFail': 'फोटो लोड नहीं हो सकीं।',
    'photos.contentRequired': 'फोटो या कैप्शन जोड़ें।',
    'photos.updateDone': 'फोटो अपडेट हो गई।',
    'photos.createDone': 'फोटो जोड़ दी गई।',
    'photos.saveFail': 'फोटो सेव नहीं हो सकी।',
    'photos.deleteTitle': 'फोटो हटाएँ',
    'photos.deleteConfirm': 'यह फोटो हटाएँ?',
    'photos.deleteFail': 'फोटो हटाई नहीं जा सकी।',

    'manager.photoAdd': 'फोटो जोड़ें',
    'manager.hero': 'मुख्य फोटो',
    'manager.heroImageRequired': 'मुख्य फोटो केवल इमेज वाली फोटो हो सकती है।',
    'manager.heroSelectedTitle': 'सेट हो गया',
    'manager.heroSelectedDesc': 'मुख्य फोटो के रूप में चुना गया।\nपुष्टि के लिए ऊपर सेव पर टैप करें।',
    'manager.uploadFailImage': 'इमेज अपलोड नहीं हो सकी।',
  },

  ar: {
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.count': '{{count}}',
    'common.saveDone': 'تم الحفظ.',
    'common.editDone': 'تم التحديث.',

    'create.companySaved': 'تم حفظ معلومات الشركة.',
    'create.saveFail': 'تعذر الحفظ.',
    'create.galleryPermission': 'يرجى السماح بالوصول إلى المعرض.',
    'create.businessRequired': 'أنشئ النشاط التجاري أولًا.',
    'create.contentRequired': 'أضف صورة أو نصًا.',
    'create.imageUploadFail': 'فشل رفع الصورة.',
    'create.photoDeleteConfirm': 'هل تريد حذف هذه الصورة؟',
    'create.photoDeleteFail': 'تعذر حذف الصورة.',
    'create.photoEditDone': 'تم تحديث الصورة.',
    'create.photoCreateDone': 'تمت إضافة الصورة.',
    'create.photoSaveFail': 'تعذر حفظ الصورة.',
    'create.heroSelected': 'تم تعيينها كصورة رئيسية.\nاضغط حفظ في الأعلى للتأكيد.',

    'info.aiGenerateDone': 'تم إنشاء موجز AI.',
    'info.aiGenerateFailed': 'تعذر إنشاء موجز AI.',

    'menu.all': 'الكل',
    'menu.signature': 'مميز',

    'photos.editTitle': 'تعديل الصورة',
    'photos.newTitle': 'صورة جديدة',
    'photos.select': 'اختيار صورة',
    'photos.captionPlaceholder': 'وصف الصورة',
    'photos.submitEdit': 'تحديث',
    'photos.submitNew': 'إضافة',
    'photos.viewerTitle': 'صورة',
    'photos.gridTitle': 'الصور',
    'photos.gridSubtitle': 'إدارة الصورة الرئيسية وصور المتجر.',
    'photos.empty': 'لا توجد صور بعد.',
    'photos.fetchFail': 'تعذر تحميل الصور.',
    'photos.contentRequired': 'أضف صورة أو وصفًا.',
    'photos.updateDone': 'تم تحديث الصورة.',
    'photos.createDone': 'تمت إضافة الصورة.',
    'photos.saveFail': 'تعذر حفظ الصورة.',
    'photos.deleteTitle': 'حذف الصورة',
    'photos.deleteConfirm': 'هل تريد حذف هذه الصورة؟',
    'photos.deleteFail': 'تعذر حذف الصورة.',

    'manager.photoAdd': 'إضافة صورة',
    'manager.hero': 'الصورة الرئيسية',
    'manager.heroImageRequired': 'يمكن تعيين الصور التي تحتوي على صورة فقط كصورة رئيسية.',
    'manager.heroSelectedTitle': 'تم التعيين',
    'manager.heroSelectedDesc': 'تم اختيارها كصورة رئيسية.\nاضغط حفظ في الأعلى للتأكيد.',
    'manager.uploadFailImage': 'تعذر رفع الصورة.',
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Fill any missing language by English so the key never leaks to UI.
for (const lang of LANGS) {
  if (!PATCH[lang]) PATCH[lang] = clone(PATCH.en);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function isMissingValue(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function getByPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return acc[part];
  }, obj);
}

function setByPath(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function patchLocale(lang) {
  const filePath = path.join(LOCALE_ROOT, lang, 'business.json');
  const data = readJson(filePath);
  const patch = PATCH[lang] || PATCH.en;
  const changed = [];

  for (const [key, value] of Object.entries(patch)) {
    if (isMissingValue(getByPath(data, key))) {
      setByPath(data, key, value);
      changed.push(key);
    }
  }

  if (changed.length > 0) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  return { lang, filePath, changed };
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'android' || entry.name === 'ios') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectBusinessKeysFromSource() {
  const srcDir = path.join(ROOT, 'src');
  const files = walkFiles(srcDir);
  const keys = new Set();

  const patterns = [
    /t\(\s*['"]business:([^'"]+)['"]/g,
    /i18n\.t\(\s*['"]business:([^'"]+)['"]/g,
  ];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      let match;
      while ((match = re.exec(text))) keys.add(match[1]);
    }
  }

  return Array.from(keys).sort();
}

function verifyLocale(lang, keys) {
  const filePath = path.join(LOCALE_ROOT, lang, 'business.json');
  const data = readJson(filePath);
  return keys.filter((key) => isMissingValue(getByPath(data, key)));
}

function main() {
  console.log('[business-i18n] patch start');
  if (!fs.existsSync(LOCALE_ROOT)) {
    throw new Error(`Locale directory not found: ${LOCALE_ROOT}`);
  }

  const results = LANGS.map(patchLocale);
  for (const result of results) {
    if (result.changed.length === 0) {
      console.log(`  - ${result.lang}: no changes`);
    } else {
      console.log(`  - ${result.lang}: added ${result.changed.length} keys`);
      for (const key of result.changed) console.log(`      + ${key}`);
    }
  }

  const usedKeys = collectBusinessKeysFromSource();
  if (usedKeys.length === 0) {
    console.log('[business-i18n] no business namespace keys found in src');
    return;
  }

  let hasMissing = false;
  console.log(`[business-i18n] verifying ${usedKeys.length} business keys from source`);
  for (const lang of LANGS) {
    const missing = verifyLocale(lang, usedKeys);
    if (missing.length > 0) {
      hasMissing = true;
      console.warn(`  ! ${lang}: ${missing.length} unresolved keys`);
      for (const key of missing.slice(0, 80)) console.warn(`      - business:${key}`);
      if (missing.length > 80) console.warn(`      ... and ${missing.length - 80} more`);
    }
  }

  if (hasMissing) {
    console.warn('[business-i18n] patch finished, but unresolved business keys remain. Add them to PATCH if needed.');
  } else {
    console.log('[business-i18n] patch finished. No unresolved business keys found.');
  }
}

main();
