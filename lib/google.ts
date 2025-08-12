
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

function getGoogleAuth() {
    // GOOGLE_APPLICATION_CREDENTIALS環境変数が設定されている場合、
    // ライブラリが自動的にそのファイルパスから認証情報を読み込みます。
    return new google.auth.GoogleAuth({
        scopes: SCOPES
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
