/**
 * Google Apps Script - スプレッドシート自動監視システム
 * 新しい列（企業データ）が追加されたら自動で課題抽出・マッチング処理を実行
 */

// 設定
const CONFIG = {
  // Next.jsアプリのベースURL（本番環境では適切なURLに変更）
  NEXTJS_BASE_URL: 'https://your-app-domain.com', // または 'http://localhost:3000'
  
  // 監視対象のスプレッドシートID
  SPREADSHEET_ID: '1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY',
  
  // シートタイプとGIDのマッピング
  SHEET_MAPPING: {
    'CL': '0',
    'CU': '609102789', 
    'CP': '1336297365'
  },
  
  // 結果出力先スプレッドシートID
  RESULT_SPREADSHEET_ID: '1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY',
  
  // 処理状況を記録するプロパティキー
  LAST_PROCESSED_KEY: 'LAST_PROCESSED_COLUMNS'
};

/**
 * スプレッドシートの変更を監視するトリガー関数
 * 新しい企業データが追加されたかチェック
 */
function checkForNewCompanyData() {
  console.log('=== スプレッドシート変更監視開始 ===');
  
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const lastProcessed = getLastProcessedColumns();
    let hasNewData = false;
    
    // 各シートタイプをチェック
    for (const [sheetType, gid] of Object.entries(CONFIG.SHEET_MAPPING)) {
      const sheet = getSheetByGid(spreadsheet, gid);
      if (!sheet) {
        console.warn(`シート ${sheetType} (GID: ${gid}) が見つかりません`);
        continue;
      }
      
      const currentColumns = getCurrentColumnCount(sheet);
      const lastProcessedColumns = lastProcessed[sheetType] || 0;
      
      console.log(`${sheetType}シート: 現在の列数=${currentColumns}, 前回処理時=${lastProcessedColumns}`);
      
      if (currentColumns > lastProcessedColumns) {
        console.log(`${sheetType}シートに新しいデータが検出されました`);
        hasNewData = true;
        
        // 新しいデータの日付を特定
        const newDataDate = detectNewDataDate(sheet, lastProcessedColumns, currentColumns);
        if (newDataDate) {
          console.log(`新しいデータの日付: ${newDataDate}`);
          
          // 自動処理を実行
          triggerAutomaticProcessing(sheetType, newDataDate);
          
          // 処理済み列数を更新
          lastProcessed[sheetType] = currentColumns;
        }
      }
    }
    
    // 処理済み情報を保存
    if (hasNewData) {
      saveLastProcessedColumns(lastProcessed);
    }
    
    console.log('=== スプレッドシート変更監視完了 ===');
    
  } catch (error) {
    console.error('スプレッドシート監視エラー:', error);
    // エラー通知（Slack、メールなど）を送信することも可能
  }
}

/**
 * GIDからシートを取得
 */
function getSheetByGid(spreadsheet, gid) {
  const sheets = spreadsheet.getSheets();
  for (const sheet of sheets) {
    if (sheet.getSheetId().toString() === gid) {
      return sheet;
    }
  }
  return null;
}

/**
 * シートの現在の列数を取得
 */
function getCurrentColumnCount(sheet) {
  const lastColumn = sheet.getLastColumn();
  return lastColumn;
}

/**
 * 新しいデータの日付を特定
 */
function detectNewDataDate(sheet, lastProcessedColumns, currentColumns) {
  try {
    // 1行目（ヘッダー行）から日付情報を取得
    const headerRange = sheet.getRange(1, lastProcessedColumns + 1, 1, currentColumns - lastProcessedColumns);
    const headerValues = headerRange.getValues()[0];
    
    // 最初の非空白セルの値を日付として返す
    for (const value of headerValues) {
      if (value && value !== '') {
        // 日付形式を正規化
        if (value instanceof Date) {
          return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy/MM/dd');
        } else if (typeof value === 'string') {
          return value;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('日付検出エラー:', error);
    return null;
  }
}

/**
 * 自動処理をトリガー
 */
function triggerAutomaticProcessing(sheetType, date) {
  console.log(`自動処理開始: ${sheetType}シート, 日付: ${date}`);
  
  try {
    // Next.jsアプリの自動処理APIを呼び出し
    const url = `${CONFIG.NEXTJS_BASE_URL}/api/automation/process-new-data`;
    const payload = {
      sheetType: sheetType,
      date: date,
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resultSpreadsheetId: CONFIG.RESULT_SPREADSHEET_ID
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      console.log('自動処理成功:', result);
      
      // 処理完了通知（オプション）
      sendNotification(`✅ 自動処理完了: ${sheetType}シート (${date})\\n処理企業数: ${result.processedCompanies || 0}社`);
      
    } else {
      throw new Error(`API呼び出し失敗: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('自動処理エラー:', error);
    
    // エラー通知
    sendNotification(`❌ 自動処理エラー: ${sheetType}シート (${date})\\nエラー: ${error.message}`);
  }
}

/**
 * 通知送信（Slack、メールなど）
 */
function sendNotification(message) {
  console.log('通知:', message);
  
  // Slack通知の例（Webhook URLを設定する場合）
  /*
  const slackWebhookUrl = 'YOUR_SLACK_WEBHOOK_URL';
  if (slackWebhookUrl) {
    try {
      UrlFetchApp.fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        payload: JSON.stringify({ text: message })
      });
    } catch (error) {
      console.error('Slack通知エラー:', error);
    }
  }
  */
}

/**
 * 前回処理済み列数を取得
 */
function getLastProcessedColumns() {
  const stored = PropertiesService.getScriptProperties().getProperty(CONFIG.LAST_PROCESSED_KEY);
  return stored ? JSON.parse(stored) : {};
}

/**
 * 処理済み列数を保存
 */
function saveLastProcessedColumns(data) {
  PropertiesService.getScriptProperties().setProperty(CONFIG.LAST_PROCESSED_KEY, JSON.stringify(data));
}

/**
 * 手動実行用：すべての処理済み状況をリセット
 */
function resetProcessedStatus() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.LAST_PROCESSED_KEY);
  console.log('処理済み状況をリセットしました');
}

/**
 * 手動実行用：現在の状況を確認
 */
function checkCurrentStatus() {
  const lastProcessed = getLastProcessedColumns();
  console.log('現在の処理済み状況:', lastProcessed);
  
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  for (const [sheetType, gid] of Object.entries(CONFIG.SHEET_MAPPING)) {
    const sheet = getSheetByGid(spreadsheet, gid);
    if (sheet) {
      const currentColumns = getCurrentColumnCount(sheet);
      console.log(`${sheetType}シート: 現在の列数=${currentColumns}, 処理済み=${lastProcessed[sheetType] || 0}`);
    }
  }
}

/**
 * トリガーを設定する関数（初回セットアップ時に実行）
 */
function setupTriggers() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // 5分ごとにチェックするトリガーを設定
  ScriptApp.newTrigger('checkForNewCompanyData')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  console.log('トリガーを設定しました（5分間隔）');
}
