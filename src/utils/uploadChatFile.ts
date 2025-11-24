// src/utils/uploadChatFile.ts
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export async function uploadToBucket(
  bucket: 'chat-media' | 'chat-files',
  roomId: number,
  uri: string,
  fileName: string,
  mime?: string
) {
  const key = `${roomId}/${uuidv4()}__${fileName}`;
  const bin = await (await fetch(uri)).arrayBuffer();    // 👈 Base64 대신 ArrayBuffer
  const { error } = await supabase.storage.from(bucket).upload(key, bin, {
    contentType: mime || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return { bucket, key };
}

export async function pickMedia() {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.9,
  });
  if (res.canceled) return null;
  const a = res.assets[0];
  const isVideo = a.type === 'video';
  const fileName = a.fileName ?? (isVideo ? 'media.mp4' : 'media.jpg');
  const mime = isVideo ? 'video/mp4' : 'image/jpeg';
  return { uri: a.uri, fileName, mime, type: isVideo ? 'video' : 'image' as const };
}

export async function pickDocument() {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled) return null;
  const f = res.assets[0];
  return {
    uri: f.uri,
    fileName: f.name ?? 'file',
    mime: f.mimeType ?? 'application/octet-stream',
  };
}
