// src/lib/chatDB/database.ts

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { chatSchema } from './schema';
import migrations from './migrations/index';

import Message from './models/Message';
import Attachment from './models/Attachment';
import Room from './models/Room';
import Profile from './models/Profile';
import MessageTranslation from './models/MessageTranslation';
import RoomReadState from './models/RoomReadState';
import MessageBookmark from './models/MessageBookmark';
import MessageReaction from './models/MessageReaction';
import MessageReactionCount from './models/MessageReactionCount';
import RoomOpenSnapshot from './models/RoomOpenSnapshot';


const adapter = new SQLiteAdapter({
  schema: chatSchema,
  migrations,
  dbName: 'chatdb',
  onSetUpError: (error) => {
    console.error('[DB] onSetUpError', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Message,
    Attachment,
    Room,
    Profile,
    MessageTranslation,
    RoomReadState,
    MessageBookmark,
    MessageReaction,
    MessageReactionCount,
    RoomOpenSnapshot,
  ],
});

export default database;
