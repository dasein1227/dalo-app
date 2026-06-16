const fs = require('fs');
const jwt = require('jsonwebtoken');

const TEAM_ID = 'Q3RXD89LZ7';

// Supabase OAuth용 Secret Key는 Services ID 기준
const CLIENT_ID = 'com.geniestudio.coonn.service';

// Apple 로그인용 Key ID
const KEY_ID = '6SFH2A8B9A';

// Apple 로그인용 .p8 파일 경로
const PRIVATE_KEY_PATH = 'C:/Users/dasei/Downloads/AuthKey_6SFH2A8B9A.p8';

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  throw new Error(`Private key file not found: ${PRIVATE_KEY_PATH}`);
}

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const now = Math.floor(Date.now() / 1000);

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  },
  privateKey,
  {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: KEY_ID,
    },
  }
);

console.log(token);
