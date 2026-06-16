// messages.js (또는 채팅 관련 서비스 파일)
import { database } from './database'; // WatermelonDB 인스턴스
import { supabase } from './supabase'; // Supabase 클라이언트

export const sendMessage = async (roomId, userId, text) => {
  const messagesCollection = database.get('messages');

  // 1. [선반영] 내 폰 DB에 먼저 저장 (UI에는 이미 메시지가 뜸)
  let localMessage;
  await database.write(async () => {
    localMessage = await messagesCollection.create(message => {
      message.room_id = roomId;
      message.user_id = userId;
      message.content = text;
      message.is_read = false;
      message.status = 'sending'; // 전송 중 상태 표시
    });
  });

  try {
    // 2. [전송] Supabase Edge Function 호출 (DB Insert 아님!)
    const { data, error } = await supabase.functions.invoke('send-message', {
      body: { 
        roomId, 
        userId, 
        content: text,
        localId: localMessage.id // 나중에 매칭을 위해 로컬 ID 전송
      },
    });

    if (error) throw error;

    // 3. [완료] 전송 성공하면 상태 업데이트
    await database.write(async () => {
      await localMessage.update(msg => {
        msg.status = 'sent';
        // 서버에서 확정된 ID나 시간 등을 받아와서 업데이트
        if(data?.serverParams) {
             msg.server_created_at = data.serverParams.createdAt;
        }
      });
    });

  } catch (err) {
    console.error('메시지 전송 실패:', err);
    // 실패 시 '재전송 버튼'을 띄우기 위해 status 변경
    await database.write(async () => {
      await localMessage.update(msg => {
        msg.status = 'failed'; 
      });
    });
  }
};