# スプレッドシート自動化システム

スプレッドシートに新しい企業データが追加されたら自動的に課題抽出・マッチング処理を実行し、結果をスプレッドシートに出力するシステムです。

## システム構成

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  Google Spreadsheet │    │  Google Apps Script  │    │   Next.js App      │
│  (データ入力)        │───▶│  (変更検知・監視)     │───▶│  (処理実行)          │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                                                  │
                                                                  ▼
┌─────────────────────┐                                ┌─────────────────────┐
│  Result Spreadsheet │◀───────────────────────────────│  課題抽出・マッチング │
│  (結果出力)          │                                │  処理                │
└─────────────────────┘                                └─────────────────────┘
```

## 機能

### 1. 自動監視・処理
- **Google Apps Script**: スプレッドシートの変更を5分間隔で監視
- **自動検知**: 新しい列（企業データ）が追加されたら自動的に検知
- **自動処理**: 課題抽出・マッチング処理を自動実行
- **自動出力**: 結果を指定されたスプレッドシートに自動書き込み

### 2. バッチ処理
- **定期実行**: 過去7日分の未処理データを一括処理
- **cron対応**: GitHub ActionsやVercel Cronで定期実行可能

### 3. 手動処理
- **管理画面**: `/automation` ページから手動で処理実行
- **柔軟な指定**: シートタイプ・日付を指定して処理可能

## セットアップ手順

### 1. Google Apps Scriptの設定

1. **新しいプロジェクトを作成**
   - [Google Apps Script](https://script.google.com/) にアクセス
   - 「新しいプロジェクト」をクリック

2. **コードをコピー**
   - `automation/google-apps-script/sheet-monitor.js` の内容をコピー
   - `Code.gs` に貼り付け

3. **設定を更新**
   ```javascript
   const CONFIG = {
     // 本番環境のURLに変更
     NEXTJS_BASE_URL: 'https://your-app-domain.com',
     
     // スプレッドシートIDを確認・更新
     SPREADSHEET_ID: '1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY',
     
     // 結果出力先スプレッドシートID
     RESULT_SPREADSHEET_ID: '1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY'
   };
   ```

4. **権限を設定**
   - 「権限を確認」をクリック
   - Google Sheets API と UrlFetch の権限を許可

5. **トリガーを設定**
   - スクリプトエディタで `setupTriggers` 関数を実行
   - または手動でトリガーを設定：
     - 関数: `checkForNewCompanyData`
     - イベント: 時間主導型
     - 間隔: 5分ごと

### 2. Next.jsアプリの設定

1. **環境変数を設定**
   ```bash
   # .env.local
   NEXT_PUBLIC_BASE_URL=https://your-app-domain.com
   # または開発環境では
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

2. **APIエンドポイントを確認**
   - `/api/automation/process-new-data` - 自動処理API
   - `/api/automation/batch-process` - バッチ処理API

### 3. 定期バッチ処理の設定（オプション）

#### GitHub Actionsの場合

`.github/workflows/batch-process.yml`:
```yaml
name: Batch Process
on:
  schedule:
    - cron: '0 */6 * * *' # 6時間ごと
  workflow_dispatch: # 手動実行も可能

jobs:
  batch-process:
    runs-on: ubuntu-latest
    steps:
      - name: Run Batch Process
        run: |
          curl -X POST https://your-app-domain.com/api/automation/batch-process \\
            -H "Content-Type: application/json" \\
            -d '{"daysBack": 7}'
```

#### Vercel Cronの場合

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/automation/batch-process",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

## 使用方法

### 自動処理
1. Google Apps Scriptのトリガーが設定されていることを確認
2. スプレッドシートに新しい企業データを追加
3. 5分以内に自動的に処理が開始される
4. 結果が指定されたスプレッドシートに出力される

### 手動処理
1. `/automation` ページにアクセス
2. 「テスト処理実行」または「手動処理」を選択
3. 必要に応じてシートタイプと日付を指定
4. 処理結果を確認

### バッチ処理
1. `/automation` ページで「バッチ処理実行」をクリック
2. または定期実行が設定されている場合は自動実行

## トラブルシューティング

### よくある問題

1. **Google Apps Scriptの権限エラー**
   - 解決: スクリプトエディタで権限を再度許可

2. **APIエンドポイントへのアクセスエラー**
   - 解決: `NEXTJS_BASE_URL` が正しく設定されているか確認

3. **処理が実行されない**
   - 解決: トリガーが正しく設定されているか確認
   - 解決: Google Apps Scriptのログを確認

4. **結果が出力されない**
   - 解決: 結果出力先スプレッドシートのIDが正しいか確認
   - 解決: スプレッドシートの権限を確認

### ログの確認方法

1. **Google Apps Script**
   - スクリプトエディタ → 実行 → ログを表示

2. **Next.jsアプリ**
   - サーバーログまたはVercelのFunction Logsを確認

3. **自動化管理画面**
   - `/automation` ページで処理結果を確認

## API仕様

### POST /api/automation/process-new-data
新しいデータの自動処理を実行

**リクエスト:**
```json
{
  "sheetType": "CL" | "CU" | "CP",
  "date": "2025/09/04",
  "spreadsheetId": "スプレッドシートID",
  "resultSpreadsheetId": "結果出力先ID"
}
```

**レスポンス:**
```json
{
  "success": true,
  "processedCompanies": 5,
  "totalMatches": 15,
  "timestamp": "2025-09-17T..."
}
```

### POST /api/automation/batch-process
バッチ処理を実行

**リクエスト:**
```json
{
  "daysBack": 7,
  "checkProcessedFlag": false
}
```

**レスポンス:**
```json
{
  "success": true,
  "summary": {
    "totalProcessed": 10,
    "totalErrors": 0,
    "totalAttempts": 10
  },
  "results": [...]
}
```

## セキュリティ

- Google Apps ScriptからのAPIアクセスには適切な認証を実装することを推奨
- 本番環境では HTTPS を使用
- API レート制限を考慮した実装

## 監視・アラート

- 処理エラー時の通知機能（Slack、メールなど）の実装を推奨
- 定期的な処理状況の確認
- ログの監視と分析
