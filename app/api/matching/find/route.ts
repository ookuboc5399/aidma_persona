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
    const { challengeId } = await req.json();

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Challenge ID is required' },
        { status: 400 }
      );
    }

    // 課題データを取得
    const { data: challengeData, error: challengeError } = await supabase
      .from('company_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (challengeError || !challengeData) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }

    // 解決企業候補を取得
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*');

    if (companiesError || !companies) {
      return NextResponse.json(
        { error: 'Failed to fetch companies' },
        { status: 500 }
      );
    }

    // ChatGPTを使ってマッチング分析
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `あなたは企業マッチングの専門家です。企業の課題と解決企業のマッチング分析を行ってください。

マッチング評価の観点：
1. 業種・事業領域の関連性
2. 企業規模の適合性
3. 地域的な近さ
4. 事業タグ・オリジナルタグの関連性
5. 課題解決の実現可能性

各企業に対してマッチングスコア（0.0-1.0）を算出し、以下のJSON形式で返してください：
{
  "matches": [
    {
      "company_id": "企業ID",
      "company_name": "企業名",
      "match_score": 0.85,
      "match_reason": "マッチング理由",
      "solution_details": "具体的な解決方法",
      "advantages": ["メリット1", "メリット2"],
      "considerations": ["検討事項1", "検討事項2"]
    }
  ]
}

上位5社程度に絞って回答してください。`
        },
        {
          role: "user",
          content: `
課題企業: ${challengeData.company_name}
抽出された課題:
${challengeData.extracted_challenges.join('\n')}

課題詳細:
${JSON.stringify(challengeData.challenge_analysis, null, 2)}

解決企業候補:
${companies.map(company => 
  `ID: ${company.id}
企業名: ${company.company_name}
親業種: ${company.parent_industry || '未設定'}
業種: ${company.industry || '未設定'}
事業タグ: ${company.business_tags?.join(', ') || '未設定'}
オリジナルタグ: ${company.original_tags?.join(', ') || '未設定'}
地域: ${company.region || '未設定'}
都道府県: ${company.prefecture || '未設定'}
備考: ${company.notes || ''}
---`
).join('\n')}
`
        }
      ],
      temperature: 0.3,
    });

    const matchingContent = completion.choices[0]?.message?.content;
    if (!matchingContent) {
      throw new Error('Failed to generate matching analysis');
    }

    let matchingAnalysis;
    try {
      matchingAnalysis = JSON.parse(matchingContent);
    } catch (error) {
      throw new Error('Failed to parse matching analysis response');
    }

    // マッチング結果をデータベースに保存
    const matchingPromises = matchingAnalysis.matches?.map(async (match: any) => {
      const { data, error } = await supabase
        .from('company_matchings')
        .insert({
          challenge_id: challengeId,
          solution_company_id: match.company_id,
          match_score: match.match_score,
          match_reason: match.match_reason,
          match_details: {
            solution_details: match.solution_details,
            advantages: match.advantages,
            considerations: match.considerations
          }
        })
        .select('*, companies(*)')
        .single();

      if (error) {
        console.error('Failed to save matching result:', error);
        return null;
      }

      return data;
    }) || [];

    const matchingResults = await Promise.all(matchingPromises);
    const validResults = matchingResults.filter(result => result !== null);

    return NextResponse.json({
      success: true,
      challengeId,
      companyName: challengeData.company_name,
      matches: validResults,
      totalMatches: validResults.length,
    });

  } catch (error: unknown) {
    console.error('Matching error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to find matches: ${errorMessage}` },
      { status: 500 }
    );
  }
}
