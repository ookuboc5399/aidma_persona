import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 議事録からペルソナを抽出するプロンプト
const PERSONA_EXTRACTION_PROMPT = `あなたは商談議事録から「業種×ペルソナ（解決できる課題）」を抽出するアシスタントです。
・業種は「クライアントが狙いたい業界/業種」と明言したものだけ抽出。推定はしない。
・ペルソナは「クライアントのサービスで解決できる課題」を、議事録の言い回しで保持。
・出力は必ず指定のJSONスキーマに従う。存在しない要素は省略せず、空配列や raw を再掲する。
・冗長な説明や考察、補足文はJSONの外に書かない。
・マークダウンのコードブロック（\`\`\`json）は使用せず、純粋なJSONのみを出力してください。

出力スキーマ：
{
  "client_service_name": "string",
  "targets": [
    {
      "industry_raw": "string",        // 議事録そのままの表現
      "industry_normalized": "string", // 社内マスタ等で正規化（なければ industry_raw と同じ）
      "personas": [
        {
          "persona_statement_raw": "string",      // 議事録での課題表現をそのまま
          "persona_mapped": "string",             // 社内マスタの標準課題名（なければ raw を再掲）
          "evidence_snippets": ["string", "..."], // 抜粋（最大2〜3文、発話者/タイムスタンプ任意）
          "confidence": 0.0                       // 0〜1（抽出自信度）
        }
      ],
      "confidence_industry": 0.0                  // 業種抽出の自信度（0〜1）
    }
  ],
  "notes": "string"                                // 任意の補足（抽出の前提/曖昧点など）
}

思考ルール：
1) 業種抽出：発話中の「狙いたい/攻めたい/注力したい/ターゲット」などの直後の業種を拾う。
   複数言及されていれば targets を複数化。言及が曖昧なら confidence_industry を0.33にする。
2) ペルソナ抽出：サービスが解決できる課題として語られている文を抽出し、原文を persona_statement_raw に入れる。
   社内マスタがあれば persona_mapped に正規化名、なければ raw を再掲。
3) 根拠：各 persona につき evidence_snippets を最大2〜3文添付（発話そのまま）。
4) スコア：明示・直裁な発話=0.9、示唆・要約=0.66、曖昧=0.33。
5) JSONスキーマに沿って出力のみ返す。`;

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, serviceName } = await req.json();

    if (!companyName || !conversationData) {
      return NextResponse.json(
        { error: 'Company name and conversation data are required' },
        { status: 400 }
      );
    }

    console.log('=== ペルソナ抽出処理開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`サービス名: ${serviceName || '未指定'}`);
    console.log(`会話データ長: ${conversationData.length}`);

    // OpenAI APIを使用してペルソナを抽出
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: PERSONA_EXTRACTION_PROMPT
        },
        {
          role: "user",
          content: `# クライアントサービス名
${serviceName || '未指定'}

# 議事録テキスト
${conversationData}

# メモ（任意）
・抽出ルール：業種は明言ベースのみ、推定禁止
・ペルソナ＝サービスで解決できる課題のみ`
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const extractedContent = completion.choices[0]?.message?.content;
    if (!extractedContent) {
      throw new Error('ペルソナ抽出の結果が空です');
    }

    console.log('抽出結果:', extractedContent);

    // マークダウンのコードブロックを除去
    let cleanedContent = extractedContent;
    if (cleanedContent.includes('```json')) {
      cleanedContent = cleanedContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    }
    if (cleanedContent.includes('```')) {
      cleanedContent = cleanedContent.replace(/```\s*/g, '');
    }

    console.log('クリーニング後の内容:', cleanedContent);

    // JSONパースを試行
    let extractedPersonas;
    try {
      extractedPersonas = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError);
      console.error('パースしようとした内容:', cleanedContent);
      
      // より詳細なエラーハンドリング
      if (cleanedContent.trim().length === 0) {
        extractedPersonas = {
          client_service_name: serviceName || '未指定',
          targets: [],
          notes: '抽出結果が空でした。'
        };
      } else {
        // 部分的な抽出を試行
        try {
          // JSONの開始と終了を探す
          const jsonStart = cleanedContent.indexOf('{');
          const jsonEnd = cleanedContent.lastIndexOf('}') + 1;
          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            const jsonPart = cleanedContent.substring(jsonStart, jsonEnd);
            extractedPersonas = JSON.parse(jsonPart);
          } else {
            throw new Error('有効なJSONが見つかりません');
          }
        } catch (secondParseError) {
          console.error('2回目のパースエラー:', secondParseError);
          extractedPersonas = {
            client_service_name: serviceName || '未指定',
            targets: [],
            notes: `JSONパースに失敗しました。元の内容: ${cleanedContent.substring(0, 200)}...`
          };
        }
      }
    }

    console.log('=== ペルソナ抽出処理完了 ===');

    return NextResponse.json({
      success: true,
      extractedPersonas,
      rawResponse: extractedContent,
      model_used: 'gpt-4o',
      message: 'ペルソナ抽出が完了しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナ抽出エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナ抽出失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}
