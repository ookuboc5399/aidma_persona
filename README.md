# 企業課題解決マッチングシステム

AI-powered business matching solution that extracts challenges from company conversation data and matches them with solution providers.

## 🚀 機能

- **スプレッドシート連携**: Google Sheetsから企業の会話データを自動取得
- **AI課題抽出**: ChatGPT-4を使用して企業の課題を自動分析・抽出
- **インテリジェントマッチング**: 課題と解決企業を自動マッチング
- **詳細分析**: マッチ度スコア、解決方法、メリット・デメリットを提示

## 📋 必要な準備

### 1. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```bash
# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Google Sheets API
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="your_service_account_private_key"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 2. データベースセットアップ

Supabaseプロジェクトで以下のテーブルが作成されます：
- `companies`: 解決企業情報
- `company_challenges`: 抽出された企業課題
- `company_matchings`: マッチング結果

### 3. Google Sheets API設定

1. Google Cloud Consoleでプロジェクトを作成
2. Google Sheets APIを有効化
3. サービスアカウントを作成し、JSONキーをダウンロード
4. スプレッドシートにサービスアカウントのメールアドレスを共有

## 🏗️ セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 📊 使用方法

### 1. スプレッドシート準備

マスタースプレッドシートのB列に、各企業の会話データが含まれるスプレッドシートのURLを設定します。

各企業シートの構造：
- A列: 企業名
- D列: 会話データ

### 2. システム実行

1. 「スプレッドシート読み込み」ボタンでデータを取得
2. 「課題抽出・マッチング」ボタンで各企業を個別処理
3. 「全件一括マッチング実行」で全企業を一括処理

### 3. 結果確認

- **抽出された課題**: カテゴリ別に分類された課題一覧
- **マッチング結果**: スコア順の解決企業候補
- **詳細情報**: 解決方法、メリット、検討事項

## 🛠️ 技術スタック

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI**: OpenAI GPT-4
- **Database**: Supabase (PostgreSQL)
- **Integration**: Google Sheets API

## 📁 プロジェクト構造

```
app/
├── api/
│   ├── challenges/extract/    # 課題抽出API
│   ├── matching/find/         # マッチングAPI
│   ├── process/full/          # 統合処理API
│   └── sheets/read/           # スプレッドシート読み込みAPI
├── page.tsx                   # メインUI
└── layout.tsx
lib/
└── google.ts                  # Google API設定
```

## 🔧 カスタマイズ

### 解決企業の追加

```sql
INSERT INTO companies (
  company_name, 
  parent_industry, 
  industry, 
  business_tags, 
  original_tags, 
  region, 
  prefecture, 
  notes
) VALUES (
  '企業名',
  '親業種',
  '業種',
  '{"タグ1", "タグ2"}',
  '{"特徴1", "特徴2"}',
  '地域',
  '都道府県',
  '説明'
);
```

### 課題抽出ロジックの調整

`app/api/challenges/extract/route.ts`のプロンプトを編集してカスタマイズできます。

## 📈 今後の拡張予定

- [ ] マッチング精度の向上
- [ ] レポート機能
- [ ] 企業間コミュニケーション機能
- [ ] ダッシュボード機能
