import fs from 'fs';
import path from 'path';

// ログディレクトリのパス
const LOG_DIR = path.join(process.cwd(), 'logs');

// ログディレクトリが存在しない場合は作成
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ログファイルのパスを生成
function getLogFilePath(type: string): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `${type}-${today}.log`);
}

// ログをファイルに書き込む関数
export function writeLog(type: string, message: string, data?: any): void {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    // データがある場合は追加
    const fullMessage = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}` : logMessage;
    
    // ログファイルに追記
    const logFile = getLogFilePath(type);
    fs.appendFileSync(logFile, fullMessage + '\n---\n');
    
    // コンソールにも出力（開発時の確認用）
    console.log(logMessage);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('ログ書き込みエラー:', error);
  }
}

// シート関連のログ
export function logSheet(type: 'CL' | 'CU' | 'CP', operation: string, message: string, data?: any): void {
  writeLog(`sheet-${type.toLowerCase()}`, `[${type}シート ${operation}] ${message}`, data);
}

// 企業データ取得のログ
export function logCompanyData(sheetType: 'CL' | 'CU' | 'CP', message: string, data?: any): void {
  writeLog(`company-data-${sheetType.toLowerCase()}`, `[${sheetType}シート 企業データ] ${message}`, data);
}

// 日付取得のログ
export function logDateData(sheetType: 'CL' | 'CU' | 'CP', message: string, data?: any): void {
  writeLog(`date-data-${sheetType.toLowerCase()}`, `[${sheetType}シート 日付データ] ${message}`, data);
}

// エラーログ
export function logError(operation: string, error: any, data?: any): void {
  writeLog('error', `[エラー ${operation}] ${error.message || error}`, data);
}
