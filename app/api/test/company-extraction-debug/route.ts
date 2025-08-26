import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    console.log('=== 企業情報抽出デバッグ開始 ===');
    
    const testData = {
      companyName: "古川電気工業株式会社",
      conversationData: `
【定例】SP：古川電気工業株式会社様｜

参加者: 田中社長、佐藤部長、山田主任

田中社長: 今日は、当社の現在の課題について話し合いましょう。まず、佐藤部長から現状報告をお願いします。

佐藤部長: はい、現在の課題を整理しました。まず、人材不足の問題があります。技術者の採用が難しく、特に若手エンジニアの確保が課題です。また、既存の技術者のスキルアップも必要です。

山田主任: 私からも追加で、システムの老朽化について報告します。現在使用している製造システムが10年以上前のもので、新しい技術に対応できていません。これにより、生産効率が低下し、競合他社との差が広がっています。

田中社長: なるほど、人材とシステムの両面で課題があるということですね。他には？

佐藤部長: はい、もう一つ重要な課題があります。顧客からの要望が多様化しており、従来の製品では対応できなくなっています。新しい製品開発が必要ですが、開発リソースが不足している状況です。

山田主任: また、品質管理の面でも課題があります。現在の検査システムでは、細かい品質チェックができず、不良品の流出リスクがあります。

田中社長: これらの課題を解決するために、どのような対策が必要でしょうか？

佐藤部長: まず、人材面では、採用活動の強化と社内研修の充実が必要です。システム面では、製造システムの更新と、新しい品質管理システムの導入を検討すべきです。

山田主任: 製品開発については、外部の技術パートナーとの連携も検討できると思います。
`,
      sourceUrl: "https://docs.google.com/spreadsheets/d/test"
    };

    console.log('テストデータ:', {
      companyName: testData.companyName,
      conversationDataLength: testData.conversationData.length,
      conversationDataPreview: testData.conversationData.substring(0, 200) + '...'
    });

    // ChatGPTに直接問い合わせ
    const model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model}`);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `あなたは企業情報分析の専門家です。会話データから企業の詳細情報を抽出してください。

以下の情報を抽出してください：
- 企業名
- 業種
- 事業内容の詳細説明
- 企業の強み
- 事業タグ（BUSINESS_TAGS）
- オリジナルタグ（ORIGINAL_TAGS）
- 地域
- 都道府県

JSON形式で回答してください：
{
  "company_info": {
    "company_name": "企業名",
    "industry": "業種",
    "business_description": "事業内容の詳細説明",
    "business_tags": ["タグ1", "タグ2", "タグ3"],
    "original_tags": ["特徴1", "特徴2"],
    "region": "地域",
    "prefecture": "都道府県"
  },
  "strengths": [
    {
      "title": "強みのタイトル",
      "description": "強みの詳細説明",
      "category": "カテゴリ"
    }
  ]
}`
        },
        {
          role: "user",
          content: `以下の会話データから企業情報を抽出してください：

企業名: ${testData.companyName}
会話データ:
${testData.conversationData}`
        }
      ],
      ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
      ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
    });

    const content = completion.choices[0]?.message?.content;
    console.log('\n=== ChatGPT Response ===');
    console.log('Content:', content);
    console.log('Content length:', content?.length || 0);

    if (!content) {
      throw new Error('ChatGPT returned empty content');
    }

    let extractedData;
    try {
      extractedData = JSON.parse(content);
      console.log('\n=== Parsed JSON ===');
      console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    } catch (error) {
      console.error('JSON parse error:', error);
      console.log('Raw content that failed to parse:', content);
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return NextResponse.json({
      success: true,
      rawContent: content,
      parsedData: extractedData,
      model: model
    });

  } catch (error: unknown) {
    console.error('企業情報抽出デバッグエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Debug failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
