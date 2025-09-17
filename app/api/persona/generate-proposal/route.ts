import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { extractedPersonas, targetSearchResults, companyName, serviceName, companyInfo } = await req.json();

    if (!extractedPersonas || !targetSearchResults || !companyName) {
      return NextResponse.json(
        { error: 'Extracted personas, target search results, and company name are required' },
        { status: 400 }
      );
    }

    console.log('=== ターゲット提案書生成開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`サービス名: ${serviceName || '未指定'}`);

    // マッチしたデータから統計情報を抽出
    const matchStatistics = analyzeMatchData(targetSearchResults);
    console.log('マッチ統計情報:', matchStatistics);

    // 提案書生成プロンプト
    const proposalPrompt = `あなたは営業戦略コンサルタントです。以下の情報を基に、企業向けのターゲット提案書を作成してください。

# 企業情報
- 企業名: ${companyName}
- サービス名: ${serviceName || '未指定'}

# 企業のサービス内容（会話データから抽出された情報）
${companyInfo ? JSON.stringify(companyInfo, null, 2) : '企業のサービス情報は未取得です'}

# 抽出されたペルソナ（企業が解決できる課題）
${JSON.stringify(extractedPersonas, null, 2)}

# データベース検索結果（RAGで使用するデータ）
## マッチしたターゲットデータの統計
${JSON.stringify(matchStatistics, null, 2)}

## マッチした企業データの詳細（必ず使用する）
${JSON.stringify(targetSearchResults.searchResults?.slice(0, 10), null, 2)}

# データベースの各カラムの説明
- BUSINESS_TAG: 細分化された業種/商材
- DEPARTMENT: 部署
- SIZE_BAND: 規模帯
- CHALLENGE_NAME: 課題名
- SYMPTOM: 課題の症状・具体像
- RECOMMENDED_OUTBOUND_PLAY: 推奨アウトバウンド施策
- PRIMARY_KPI: 主要KPI

以下の形式で提案書を作成してください：

【御社のサービスが解決できるターゲット像（ペルソナ提案）】

◆ 対象業種・部門・規模
- 商材：[データベースのBUSINESS_TAGから最も関連性の高い業種/商材を選択]
- 部署：[データベースのDEPARTMENTから最も関連性の高い部署を選択]
- 人数帯：[データベースのSIZE_BANDから最も関連性の高い人数帯を選択]

◆ 想定される具体的な課題（支援実績の傾向）
※ データベースのCHALLENGE_NAMEとSYMPTOMの内容を必ず使用
- [CHALLENGE_NAME] … [SYMPTOMの内容]
- [CHALLENGE_NAME] … [SYMPTOMの内容]
- [CHALLENGE_NAME] … [SYMPTOMの内容]

◆ 提案のポイント（施策の方向性）
※ データベースのRECOMMENDED_OUTBOUND_PLAYの内容を必ず使用
- [RECOMMENDED_OUTBOUND_PLAYから抽出した施策1]
- [RECOMMENDED_OUTBOUND_PLAYから抽出した施策2]
- [RECOMMENDED_OUTBOUND_PLAYから抽出した施策3]

◆ 成果指標（合意したいKPI）
※ データベースのPRIMARY_KPIの内容を必ず使用（ただし、以下のKPIは除外：通電率/到達率/診断受諾率/1st Mtg率/SQL化率）
- [PRIMARY_KPIの内容（除外対象KPI以外）]

◆ なぜこの提案に至ったのか（思考プロセス）
【重要】以下の形式で企業のサービス内容とペルソナを基にした提案理由を記述してください：

[企業名]のサービスを導入することで解決できる課題

[企業名]が提供するサービス（[実際のサービス内容を記載]）を導入することで、顧客企業は以下の課題を解決できると期待されます。

1. [ペルソナで抽出された課題1]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]

2. [ペルソナで抽出された課題2]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]

3. [ペルソナで抽出された課題3]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]
• [具体的な解決方法]: [企業のサービスがどのように課題を解決するかの詳細説明]

[企業名]は、[企業の戦略や方針]のため、[具体的なターゲット戦略]をターゲットとしています。また、[追加のサービス領域]も手掛けるケースがあります。

重要：
- データベースの内容（BUSINESS_TAG、DEPARTMENT、SIZE_BAND、CHALLENGE_NAME、SYMPTOM、RECOMMENDED_OUTBOUND_PLAY、PRIMARY_KPI）を必ず使用する
- 企業のペルソナとデータベースの内容を組み合わせて論理的な説明を行う
- データベースにない情報は推測で補完しない
- データベースの実際の値を使用して具体的な提案を行う
- 成果指標（KPI）から以下の項目は除外する：通電率、到達率、診断受諾率、1st Mtg率、SQL化率`;

    // OpenAI APIを使用して提案書を生成
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "あなたは営業戦略コンサルタントです。企業の実際のサービス内容とペルソナ（解決できる課題）を基に、データベースの内容を活用してターゲット提案書を作成してください。特に「なぜこの提案に至ったのか」の項目では、企業の具体的なサービス内容（受託開発、決済代行、システム開発など）とペルソナで抽出された課題を組み合わせて、なぜそのターゲットが最適なのかを論理的に説明してください。データベースのBUSINESS_TAG、DEPARTMENT、SIZE_BAND、CHALLENGE_NAME、SYMPTOM、RECOMMENDED_OUTBOUND_PLAY、PRIMARY_KPIの内容を必ず使用し、企業のサービス内容とペルソナを組み合わせて論理的な提案を行ってください。成果指標（KPI）からは以下の項目を除外してください：通電率、到達率、診断受諾率、1st Mtg率、SQL化率。"
        },
        {
          role: "user",
          content: proposalPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const proposal = completion.choices[0]?.message?.content;
    if (!proposal) {
      throw new Error('提案書の生成に失敗しました');
    }

    console.log('=== ターゲット提案書生成完了 ===');

    return NextResponse.json({
      success: true,
      proposal,
      matchStatistics,
      model_used: 'gpt-4o',
      message: 'ターゲット提案書の生成が完了しました'
    });

  } catch (error: unknown) {
    console.error('ターゲット提案書生成エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ターゲット提案書生成失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * マッチしたデータから統計情報を抽出（データベース構造対応）
 */
function analyzeMatchData(targetSearchResults: any): any {
  const statistics = {
    totalMatches: targetSearchResults.summary?.totalMatches || 0,
    topBusinessTags: [] as string[],
    topDepartments: [] as string[],
    topSizeBands: [] as string[],
    topChallenges: [] as string[],
    topSymptoms: [] as string[],
    topOutboundPlays: [] as string[],
    topKpis: [] as string[],
    businessTagDistribution: {} as Record<string, number>,
    departmentDistribution: {} as Record<string, number>,
    sizeBandDistribution: {} as Record<string, number>,
    challengeDistribution: {} as Record<string, number>,
    symptomDistribution: {} as Record<string, number>
  };

  if (!targetSearchResults.searchResults) {
    return statistics;
  }

  // データベースの各カラムの分布を分析
  const businessTagCount: Record<string, number> = {};
  const departmentCount: Record<string, number> = {};
  const sizeBandCount: Record<string, number> = {};
  const challengeCount: Record<string, number> = {};
  const symptomCount: Record<string, number> = {};
  const outboundPlayCount: Record<string, number> = {};
  const kpiCount: Record<string, number> = {};

  targetSearchResults.searchResults.forEach((result: any) => {
    // BUSINESS_TAGの集計
    if (result.BUSINESS_TAG) {
      businessTagCount[result.BUSINESS_TAG] = (businessTagCount[result.BUSINESS_TAG] || 0) + 1;
    }

    // DEPARTMENTの集計
    if (result.DEPARTMENT) {
      departmentCount[result.DEPARTMENT] = (departmentCount[result.DEPARTMENT] || 0) + 1;
    }

    // SIZE_BANDの集計
    if (result.SIZE_BAND) {
      sizeBandCount[result.SIZE_BAND] = (sizeBandCount[result.SIZE_BAND] || 0) + 1;
    }

    // CHALLENGE_NAMEの集計
    if (result.CHALLENGE_NAME) {
      challengeCount[result.CHALLENGE_NAME] = (challengeCount[result.CHALLENGE_NAME] || 0) + 1;
    }

    // SYMPTOMの集計
    if (result.SYMPTOM) {
      symptomCount[result.SYMPTOM] = (symptomCount[result.SYMPTOM] || 0) + 1;
    }

    // RECOMMENDED_OUTBOUND_PLAYの集計
    if (result.RECOMMENDED_OUTBOUND_PLAY) {
      outboundPlayCount[result.RECOMMENDED_OUTBOUND_PLAY] = (outboundPlayCount[result.RECOMMENDED_OUTBOUND_PLAY] || 0) + 1;
    }

    // PRIMARY_KPIの集計
    if (result.PRIMARY_KPI) {
      kpiCount[result.PRIMARY_KPI] = (kpiCount[result.PRIMARY_KPI] || 0) + 1;
    }
  });

  // トップ項目を抽出
  statistics.topBusinessTags = Object.entries(businessTagCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag);

  statistics.topDepartments = Object.entries(departmentCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([dept]) => dept);

  statistics.topSizeBands = Object.entries(sizeBandCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([size]) => size);

  statistics.topChallenges = Object.entries(challengeCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([challenge]) => challenge);

  statistics.topSymptoms = Object.entries(symptomCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([symptom]) => symptom);

  statistics.topOutboundPlays = Object.entries(outboundPlayCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([play]) => play);

  statistics.topKpis = Object.entries(kpiCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([kpi]) => kpi);

  // 分布情報を保存
  statistics.businessTagDistribution = businessTagCount;
  statistics.departmentDistribution = departmentCount;
  statistics.sizeBandDistribution = sizeBandCount;
  statistics.challengeDistribution = challengeCount;
  statistics.symptomDistribution = symptomCount;

  return statistics;
}
