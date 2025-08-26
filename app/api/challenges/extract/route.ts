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

// テキストを指定した文字数で分割する関数（GPT-4o対応で大きなチャンクサイズ）
function splitTextIntoChunks(text: string, maxChars: number = 50000): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let endIndex = currentIndex + maxChars;
    
    // 文章の区切りの良いところで分割
    if (endIndex < text.length) {
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const lastPeriod = text.lastIndexOf('。', endIndex);
      const lastExclamation = text.lastIndexOf('！', endIndex);
      const lastQuestion = text.lastIndexOf('？', endIndex);
      
      const breakPoint = Math.max(lastNewline, lastPeriod, lastExclamation, lastQuestion);
      if (breakPoint > currentIndex) {
        endIndex = breakPoint + 1;
      }
    }

    chunks.push(text.slice(currentIndex, endIndex));
    currentIndex = endIndex;
  }

  return chunks;
}

// 複数チャンクの課題を統合する関数
function mergeChallengeAnalyses(analyses: any[]): any {
  const allChallenges: any[] = [];
  const summaries: string[] = [];

  analyses.forEach(analysis => {
    if (analysis.challenges) {
      allChallenges.push(...analysis.challenges);
    }
    if (analysis.summary) {
      summaries.push(analysis.summary);
    }
  });

  // 重複する課題を統合
  const uniqueChallenges = allChallenges.reduce((acc, challenge) => {
    const existing = acc.find((c: any) => 
      c.category === challenge.category && c.title === challenge.title
    );
    if (!existing) {
      acc.push(challenge);
    } else {
      // キーワードをマージ
      existing.keywords = [...new Set([...existing.keywords, ...challenge.keywords])];
    }
    return acc;
  }, []);

  return {
    challenges: uniqueChallenges,
    summary: summaries.join(' '),
    totalChunks: analyses.length
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

    // 会話データのサイズをチェック
    console.log(`Processing conversation data: ${conversationData.length} characters`);
    
    // GPT-4oの高いトークン制限を活用（128,000トークン ≈ 96,000文字）
    const estimatedTokens = conversationData.length * 0.75; // 概算トークン数
    console.log(`Estimated tokens: ${Math.round(estimatedTokens)}`);

    let chunks: string[];
    if (estimatedTokens <= 100000) {
      // 十分小さい場合は分割せずに一度に処理
      chunks = [conversationData];
      console.log(`Processing entire conversation in single request (${conversationData.length} chars)`);
    } else {
      // 大きすぎる場合は分割処理
      chunks = splitTextIntoChunks(conversationData, 50000);
      console.log(`Processing ${chunks.length} chunks for ${companyName}`);
    }

    // 各チャンクを並列処理（ただし、API制限を考慮して制限付き）
    const analyses = [];
    const maxConcurrent = 3; // 同時処理数を制限

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batchChunks = chunks.slice(i, i + maxConcurrent);
      
              const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        const totalChunks = chunks.length;
        console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} chars)`);

        try {
          // モデル選択ロジック
          let model = process.env.CHATGPT_MODEL || 'gpt-4o';
          
          // GPT-5の利用可能性チェック
          if (model === 'gpt-5-mini-2025-08-07') {
            console.log('Attempting to use GPT-5 model...');
            // GPT-5が利用できない場合のフォールバック
            try {
              // テスト用の小さなリクエストでGPT-5の利用可能性を確認
              const testCompletion = await openai.chat.completions.create({
                model: 'gpt-5-mini-2025-08-07',
                messages: [{ role: 'user', content: 'test' }],
                max_completion_tokens: 10
              });
              console.log('GPT-5 is available, using it for extraction');
            } catch (error: any) {
              console.warn(`GPT-5 not available: ${error.message}, falling back to GPT-4o`);
              model = 'gpt-4o';
            }
          }
          
          console.log(`Using model: ${model} for chunk ${chunkIndex + 1}`);
          
          // gpt-5-miniモデルはtemperatureパラメータをサポートしていないため、条件分岐
          const requestOptions: any = {
            model,
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
  "summary": "${chunks.length === 1 ? '企業の課題全体のサマリー' : 'この会話断片から見える課題のサマリー'}"
}

${chunks.length > 1 ? '注意：これは会話データの一部分です。断片的な情報から推測できる課題のみを抽出してください。' : '会話データ全体を分析して、包括的な課題分析を行ってください。'}`
              },
              {
                role: "user",
                content: `企業名: ${companyName}\n\n${chunks.length === 1 ? '会話データ' : `会話データ(第${chunkIndex + 1}部分)`}:\n${chunk}`
              }
            ]
          };

          // gpt-5-mini以外のモデルではtemperatureを設定
          if (!model.includes('gpt-5-mini')) {
            requestOptions.temperature = 0.3;
          }

          const completion = await openai.chat.completions.create(requestOptions);

          const extractedContent = completion.choices[0]?.message?.content;
          if (!extractedContent) {
            throw new Error(`Failed to extract challenges from chunk ${chunkIndex + 1}`);
          }

          const parsedData = JSON.parse(extractedContent);

          // 抽出された課題をログに表示
          console.log(`=== ChatGPT Challenge Extraction (Chunk ${chunkIndex + 1}/${chunks.length}) ===`);
          console.log(`Company: ${companyName}`);
          console.log(`Model Used: ${model}`);
          
          if (parsedData.challenges && parsedData.challenges.length > 0) {
            console.log('\nExtracted Challenges:');
            parsedData.challenges.forEach((challenge: any, index: number) => {
              console.log(`${index + 1}. ${challenge.title} (${challenge.category})`);
              console.log(`   Description: ${challenge.description}`);
              console.log(`   Urgency: ${challenge.urgency}`);
              if (challenge.keywords && challenge.keywords.length > 0) {
                console.log(`   Keywords: ${challenge.keywords.join(', ')}`);
              }
              console.log('---');
            });
          } else {
            console.log('No challenges extracted from this chunk');
          }

          if (parsedData.summary) {
            console.log(`Analysis Summary: ${parsedData.summary}`);
          }
          console.log('=== Challenge Extraction Complete ===\n');

          return parsedData;
        } catch (error) {
          console.error(`Error processing chunk ${chunkIndex + 1}:`, error);
          console.error(`Chunk content (first 200 chars):`, chunk.substring(0, 200));
          return {
            challenges: [],
            summary: `チャンク${chunkIndex + 1}の処理中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error: error instanceof Error ? error.message : 'Unknown error'
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
    const challengeAnalysis = mergeChallengeAnalyses(analyses);

    // 抽出された課題をテキスト配列に変換
    const extractedChallenges = challengeAnalysis.challenges?.map((challenge: any) => 
      `${challenge.category}: ${challenge.title} - ${challenge.description}`
    ) || [challengeAnalysis.summary || '課題の抽出に失敗しました'];

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
      processingInfo: {
        totalChunks: chunks.length,
        originalLength: conversationData.length,
        processedChunks: analyses.length,
        model: "gpt-4o"
      }
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
