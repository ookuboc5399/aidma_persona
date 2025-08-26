import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { UnifiedExtractionResult, ChallengeAnalysis, CompanyInfo, Challenge } from '../../../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// テキストをチャンクに分割する関数
function splitTextIntoChunks(text: string, maxChunkSize: number = 50000): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const endIndex = Math.min(currentIndex + maxChunkSize, text.length);
    chunks.push(text.substring(currentIndex, endIndex));
    currentIndex = endIndex;
  }

  return chunks;
}

// 複数チャンクの分析結果を統合する関数
function mergeAnalyses(analyses: UnifiedExtractionResult[]): UnifiedExtractionResult {
      const allChallenges: Challenge[] = [];
    const allStrengths: Array<{title: string; description: string; category: string}> = [];
  const allBusinessTags: string[] = [];
  const allOriginalTags: string[] = [];
  const businessDescriptions: string[] = [];
  const challengeSummaries: string[] = [];

  analyses.forEach(analysis => {
    // 企業情報の統合
    if (analysis.company_info?.strengths) {
      allStrengths.push(...analysis.company_info.strengths);
    }
    if (analysis.company_info?.business_tags) {
      allBusinessTags.push(...analysis.company_info.business_tags);
    }
    if (analysis.company_info?.original_tags) {
      allOriginalTags.push(...analysis.company_info.original_tags);
    }
    if (analysis.company_info?.business_description) {
      businessDescriptions.push(analysis.company_info.business_description);
    }

    // 課題の統合
    if (analysis.challenges?.challenges) {
      allChallenges.push(...analysis.challenges.challenges);
    }
    if (analysis.challenges?.summary) {
      challengeSummaries.push(analysis.challenges.summary);
    }
  });

  // 重複を除去
  const uniqueBusinessTags = [...new Set(allBusinessTags)];
  const uniqueOriginalTags = [...new Set(allOriginalTags)];

  // 最初の分析結果をベースに統合
  const baseAnalysis = analyses[0] || {};
  
  return {
    company_info: {
      company_name: baseAnalysis.company_info?.company_name,
      industry: baseAnalysis.company_info?.industry,
      business_description: businessDescriptions.join(' '),
      strengths: allStrengths,
      business_tags: uniqueBusinessTags,
      original_tags: uniqueOriginalTags,
      region: baseAnalysis.company_info?.region,
      prefecture: baseAnalysis.company_info?.prefecture
    },
    challenges: {
      challenges: allChallenges,
      summary: challengeSummaries.join(' ')
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== 企業情報・課題統合抽出開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`会話データ長: ${conversationData.length}文字`);

    // 会話データのサイズをチェック
    const estimatedTokens = conversationData.length * 0.75;
    console.log(`概算トークン数: ${Math.round(estimatedTokens)}`);

    let chunks: string[];
    if (estimatedTokens <= 100000) {
      // 十分小さい場合は分割せずに一度に処理
      chunks = [conversationData];
      console.log(`会話データを単一リクエストで処理 (${conversationData.length}文字)`);
    } else {
      // 大きすぎる場合は分割処理
      chunks = splitTextIntoChunks(conversationData, 50000);
      console.log(`${companyName}の${chunks.length}チャンクを処理`);
    }

    // 各チャンクを並列処理（ただし、API制限を考慮して制限付き）
    const analyses = [];
    const maxConcurrent = 3; // 同時処理数を制限

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batchChunks = chunks.slice(i, i + maxConcurrent);
      
      const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        const totalChunks = chunks.length;
        console.log(`チャンク ${chunkIndex + 1}/${totalChunks} を処理中 (${chunk.length}文字)`);

        try {
          // モデル選択ロジック
          let model = process.env.CHATGPT_MODEL || 'gpt-4o';
          
          // GPT-5の利用可能性チェック
          if (model === 'gpt-5-mini-2025-08-07') {
            console.log('GPT-5モデルを使用中...');
            try {
              await openai.chat.completions.create({
                model: 'gpt-5-mini-2025-08-07',
                messages: [{ role: 'user', content: 'test' }],
                max_completion_tokens: 10
              });
              console.log('GPT-5が利用可能、抽出に使用');
            } catch (error: any) {
              console.warn(`GPT-5が利用できません: ${error.message}, GPT-4oにフォールバック`);
              model = 'gpt-4o';
            }
          }

          const completion = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: `あなたは企業分析の専門家です。会話データから企業情報と課題を同時に抽出してください。

以下の形式で回答してください：
{
  "company_info": {
    "company_name": "企業名",
    "industry": "業種",
    "business_description": "事業内容の詳細説明",
    "strengths": [
      {
        "title": "強みのタイトル",
        "description": "強みの詳細説明",
        "category": "カテゴリ"
      }
    ],
    "business_tags": ["タグ1", "タグ2", "タグ3"],
    "original_tags": ["特徴1", "特徴2"],
    "region": "地域",
    "prefecture": "都道府県"
  },
  "challenges": {
    "challenges": [
      {
        "title": "課題のタイトル",
        "category": "課題のカテゴリ（人材、システム、経営、営業、マーケティングなど）",
        "description": "課題の詳細説明",
        "urgency": "緊急度（高、中、低）",
        "keywords": ["キーワード1", "キーワード2", "キーワード3"]
      }
    ],
    "summary": "全体の課題分析の要約"
  }
}

課題のカテゴリ例：
- 人材：採用、育成、スキルアップ、離職など
- システム：ITシステム、製造システム、品質管理システムなど
- 経営：戦略、組織、財務、リスク管理など
- 営業：顧客獲得、売上向上、営業効率など
- マーケティング：ブランディング、市場開拓、競合対策など

必ずJSON形式で回答してください。`
              },
              {
                role: "user",
                content: `以下の会話データから企業情報と課題を抽出してください：

企業名: ${companyName}
会話データ（チャンク ${chunkIndex + 1}/${totalChunks}）:
${chunk}

この会話から抽出できる企業情報と課題を分析してください。必ずJSON形式で回答してください。`
              }
            ],
            ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
            ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 3000 } : { max_tokens: 3000 }),
          });

          const content = completion.choices[0]?.message?.content;
          console.log(`ChatGPTレスポンス内容（最初の500文字）:`, content?.substring(0, 500));
          console.log(`レスポンス長:`, content?.length || 0);
          
          if (!content) {
            throw new Error('ChatGPTが空のレスポンスを返しました');
          }

                                let parsedData: UnifiedExtractionResult;
                      try {
                        parsedData = JSON.parse(content);
                      } catch (parseError) {
                        console.error('JSON解析エラー:', parseError);
                        console.error('生のレスポンス:', content);
                        throw new Error(`JSON解析に失敗しました: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
                      }

          // 抽出された企業情報と課題をログに表示
          console.log(`=== ChatGPT 統合抽出 (チャンク ${chunkIndex + 1}/${totalChunks}) ===`);
          console.log(`企業: ${companyName}`);
          console.log(`使用モデル: ${model}`);
          
          if (parsedData.company_info) {
            console.log('\n抽出された企業情報:');
            console.log(`企業名: ${parsedData.company_info.company_name}`);
            console.log(`業種: ${parsedData.company_info.industry}`);
            console.log(`事業内容: ${parsedData.company_info.business_description?.substring(0, 100)}...`);
          }

          if (parsedData.challenges?.challenges && parsedData.challenges.challenges.length > 0) {
            console.log('\n抽出された課題:');
            parsedData.challenges.challenges.forEach((challenge: Challenge, index: number) => {
              console.log(`${index + 1}. ${challenge.title} (${challenge.category})`);
              console.log(`   説明: ${challenge.description}`);
              console.log(`   緊急度: ${challenge.urgency}`);
              if (challenge.keywords && challenge.keywords.length > 0) {
                console.log(`   キーワード: ${challenge.keywords.join(', ')}`);
              }
              console.log('---');
            });
          } else {
            console.log('このチャンクからは課題が抽出されませんでした');
          }

          console.log('=== 統合抽出完了 ===\n');

          return parsedData;
        } catch (error) {
          console.error(`チャンク ${chunkIndex + 1} の処理中にエラーが発生しました:`, error);
          console.error(`チャンク内容（最初の200文字）:`, chunk.substring(0, 200));
          return {
            company_info: {
              company_name: '',
              industry: '',
              business_description: '',
              strengths: [],
              business_tags: [],
              original_tags: [],
              region: '',
              prefecture: ''
            },
            challenges: {
              challenges: [],
              summary: `チャンク${chunkIndex + 1}の処理中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      analyses.push(...batchResults);

      // API制限を避けるため、バッチ間で少し待機
      if (i + maxConcurrent < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
      }
    }

    // 全チャンクの分析結果を統合
    const mergedAnalysis = mergeAnalyses(analyses);

    // 抽出された課題をテキスト配列に変換
    const extractedChallenges = mergedAnalysis.challenges?.challenges?.map((challenge: Challenge) => 
      `${challenge.category}: ${challenge.title} - ${challenge.description}`
    ) || [mergedAnalysis.challenges?.summary || '課題の抽出に失敗しました'];

    console.log('\n=== 統合抽出結果 ===');
    console.log(`企業名: ${mergedAnalysis.company_info?.company_name}`);
    console.log(`業種: ${mergedAnalysis.company_info?.industry}`);
    console.log(`抽出された課題数: ${mergedAnalysis.challenges?.challenges?.length || 0}`);
    console.log(`抽出された強み数: ${mergedAnalysis.company_info?.strengths?.length || 0}`);

    return NextResponse.json({
      success: true,
      companyName,
      extractedChallenges,
      companyInfo: mergedAnalysis.company_info,
      challenges: mergedAnalysis.challenges,
      processingInfo: {
        totalChunks: chunks.length,
        originalLength: conversationData.length,
        processedChunks: analyses.length,
        model: "gpt-4o"
      }
    });

  } catch (error: unknown) {
    console.error('統合抽出エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to extract company information and challenges: ${errorMessage}` },
      { status: 500 }
    );
  }
}
