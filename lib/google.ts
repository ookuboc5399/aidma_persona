
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

function getGoogleAuth() {
  // Prefer JSON credentials from env when available (suitable for Vercel)
  const raw = process.env.GOOGLE_CREDENTIALS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Handle escaped newlines in private key if necessary
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return new google.auth.GoogleAuth({
        credentials: parsed,
        scopes: SCOPES,
      });
    } catch (e) {
      console.error('Failed to parse GOOGLE_CREDENTIALS. Falling back to default auth.', e);
    }
  }

  // Fallback: GOOGLE_APPLICATION_CREDENTIALS path or default metadata
  return new google.auth.GoogleAuth({
    scopes: SCOPES,
  });
}

// 遅延初期化のため、クライアントを返す関数をエクスポートする
export function getSheetsClient() {
  const auth = getGoogleAuth();
  return google.sheets({ version: 'v4', auth });
}

export function getDriveClient() {
  const auth = getGoogleAuth();
  return google.drive({ version: 'v3', auth });
}
