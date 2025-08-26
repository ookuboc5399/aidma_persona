
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Add a minimal type for RPC result rows
type MatchDocument = { id: number; chunk: string; similarity: number };

type RagLog = {
  request_payload?: unknown;
  query?: string;
  supabase_documents?: unknown;
  prompt?: string;
  result?: unknown;
  error?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_TEMPLATE = `
あなたはプロの営業コンサルタントです。
以下の企業情報と現状のトークスクリプト全体をレビューし、5種すべてのトークに対して改善案を作成してください。

# 企業情報
- 業界: {industry}
- 企業名: (companyName)
- 代表者: {representative}
- 住所: {address}
- 従業員数: {employees}
- Webサイト: {website}
- 設立年: {founded}
- 事業内容・商材: {businessInfo}
- マーケティングの目的: {marketingPurpose}

# 現状のトークスクリプト
## 受付突破
{receptionistTalk}

## 対象者通話
{targetTalk}

## ヒアリング
{hearingTalk}

## クロージング
{closingTalk}

## アポイント確認
{apptConfirmationTalk}

# 関連ナレッジ
{knowledge}

# 指示
- 次の5種すべてについて、それぞれ個別に改善案を作成してください。
  - 受付突破, 対象者通話, ヒアリング, クロージング, アポイント確認
- 出力は必ず以下のJSON形式に従ってください（オブジェクトで返し、results配列に5件を格納）。
{
  "results": [
    { "talk_type": "受付突破|対象者通話|ヒアリング|クロージング|アポイント確認", "improved_talk": "...", "reason": "..." },
    { ... 5件になるまで続ける ... }
  ]
}
`;

export async function POST(req: NextRequest) {
  const log: RagLog = {};
  try {
    const sheetData = await req.json();
    log.request_payload = sheetData;

    // 1. クエリを生成（業界、事業内容、全トークをサマリー化して結合）
    const query = [
      `業界: ${sheetData.industry ?? ''}`,
      `事業内容: ${sheetData.businessInfo ?? ''}`,
      `受付突破: ${(sheetData.receptionistTalk ?? '').slice(0, 400)}`,
      `対象者通話: ${(sheetData.targetTalk ?? '').slice(0, 400)}`,
      `ヒアリング: ${(sheetData.hearingTalk ?? '').slice(0, 400)}`,
      `クロージング: ${(sheetData.closingTalk ?? '').slice(0, 400)}`,
      `アポイント確認: ${(sheetData.apptConfirmationTalk ?? '').slice(0, 400)}`,
    ].join('\n');
    log.query = query;

    // 2. クエリのEmbeddingを生成
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 3. Supabaseで近傍検索
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5,
    });

    if (error) throw error;

    const docs = (documents ?? []) as MatchDocument[];
    log.supabase_documents = docs;
    const knowledge = docs.map((doc) => doc.chunk).join('\n---\n');

    // 4. プロンプトを組み立て
    let prompt = PROMPT_TEMPLATE.replace('{knowledge}', knowledge);
    for (const [key, value] of Object.entries(sheetData)) {
        prompt = prompt.replace(`{${key}}`, String(value ?? ''));
    }
    log.prompt = prompt;

    // 5. LLMで改善トークを生成（5種すべて）
    const chatResponse = await openai.chat.completions.create({
      model: process.env.CHATGPT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = chatResponse.choices[0].message?.content;
    if (!content) {
        throw new Error('Failed to get a result from OpenAI.');
    }

    const parsed = JSON.parse(content);
    log.result = parsed;

    // 成功ログ保存（ベストエフォート）
    await supabase.from('rag_execution_logs').insert({
      request_payload: log.request_payload,
      query: log.query,
      supabase_documents: log.supabase_documents,
      prompt: log.prompt,
      result: log.result,
      error: null,
    });

    return NextResponse.json(parsed);

  } catch (error) {
    log.error = (error as Error).message;
    // 失敗ログ保存（ベストエフォート）
    try {
      await supabase.from('rag_execution_logs').insert({
        request_payload: log.request_payload,
        query: log.query,
        supabase_documents: log.supabase_documents,
        prompt: log.prompt,
        result: log.result,
        error: log.error,
      });
    } catch {}

    console.error('RAG Talk API error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
