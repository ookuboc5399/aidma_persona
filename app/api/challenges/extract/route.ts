import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    // ChatGPTを使って課題を抽出
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `あなたは企業の課題分析の専門家です。与えられた会話データから、その企業が抱えている具体的な課題を抽出してください。

課題抽出の観点：
1. 業務効率化の課題
2. コスト削減の必要性
3. 人材・組織の課題
4. 技術・システムの課題
5. マーケティング・営業の課題
6. 品質向上の課題
7. コンプライアンス・セキュリティの課題
8. その他のビジネス課題

抽出した課題は以下のJSON形式で返してください：
{
  "challenges": [
    {
      "category": "課題カテゴリ",
      "title": "課題のタイトル",
      "description": "課題の詳細説明",
      "urgency": "高/中/低",
      "keywords": ["関連キーワード1", "関連キーワード2"]
    }
  ],
  "summary": "企業の課題全体のサマリー"
}`
        },
        {
          role: "user",
          content: `企業名: ${companyName}\n\n会話データ:\n${conversationData}`
        }
      ],
      temperature: 0.3,
    });

    const extractedContent = completion.choices[0]?.message?.content;
    if (!extractedContent) {
      throw new Error('Failed to extract challenges from conversation data');
    }

    let challengeAnalysis;
    try {
      challengeAnalysis = JSON.parse(extractedContent);
    } catch (error) {
      // JSONパースに失敗した場合は、テキストをそのまま保存
      challengeAnalysis = {
        challenges: [],
        summary: extractedContent,
        error: 'Failed to parse JSON response'
      };
    }

    // 抽出された課題をテキスト配列に変換
    const extractedChallenges = challengeAnalysis.challenges?.map((challenge: any) => 
      `${challenge.category}: ${challenge.title} - ${challenge.description}`
    ) || [challengeAnalysis.summary || extractedContent];

    // Supabaseに保存
    const { data, error } = await supabase
      .from('company_challenges')
      .insert({
        source_url: sourceUrl,
        company_name: companyName,
        conversation_data: conversationData,
        extracted_challenges: extractedChallenges,
        challenge_analysis: challengeAnalysis,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Failed to save to database: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      challengeId: data.id,
      companyName,
      extractedChallenges,
      challengeAnalysis,
    });

  } catch (error: unknown) {
    console.error('Challenge extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to extract challenges: ${errorMessage}` },
      { status: 500 }
    );
  }
}
