import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { filterConversationData, extractSpeakers, FilterOptions, DEFAULT_EXCLUDE_SPEAKERS } from '../../../../lib/conversation-filter';
import { comprehensiveMatchChallenges } from '../../snowflake/comprehensive-match/route';

// OpenAI クライアントは関数内で動的に作成

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// OpenAI APIを使用して課題を抽出
async function extractChallengesFromConversation(conversationData: string, companyName: string, useSecondaryKey: boolean = false): Promise<string[]> {
  try {
    // API KEY選択ロジック
    const apiKey = useSecondaryKey && process.env.OPENAI_API_KEY2 
      ? process.env.OPENAI_API_KEY2 
      : process.env.OPENAI_API_KEY;
    
    const keyType = useSecondaryKey ? 'OPENAI_API_KEY2' : 'OPENAI_API_KEY';
    console.log(`使用中のAPIキー: ${keyType}`);
    console.log(`${keyType} 存在確認:`, !!apiKey);
    console.log(`${keyType} 長さ:`, apiKey?.length || 0);

    // OpenAI クライアントを動的に作成
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // モデル選択ロジック
    let model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model} for challenge extraction`);
    
    // GPT-5の利用可能性チェック
    if (model === 'gpt-5-mini-2025-08-07') {
      console.log('GPT-5モデルを使用中...');
      try {
        await openai.chat.completions.create({
          model: 'gpt-5-mini-2025-08-07',
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 10
        });
        console.log('GPT-5が利用可能、課題抽出に使用');
      } catch (error: any) {
        console.warn(`GPT-5が利用できません: ${error.message}, GPT-4oにフォールバック`);
        model = 'gpt-4o';
      }
    }

    // 会話データの長さ制限（保守的に設定してトークン制限を防ぐ）
    let maxConversationLength;
    if (model === 'gpt-5-mini-2025-08-07') {
      maxConversationLength = 5000; // GPT-5でも保守的に設定
    } else if (model === 'gpt-4o' || model === 'gpt-4-turbo') {
      maxConversationLength = 8000; // GPT-4oも保守的に
    } else {
      maxConversationLength = 3000; // 従来のGPT-4は小さなコンテキスト
    }
    
    let truncatedData = conversationData;
    if (conversationData.length > maxConversationLength) {
      console.log(`会話データが長すぎます (${conversationData.length}文字)。${maxConversationLength}文字に切り詰めます。`);
      // 最初の部分を優先的に残す（重要な情報は通常冒頭にある）
      truncatedData = conversationData.substring(0, maxConversationLength) + "\n\n[注: 会話データが長いため一部省略されています]";
    }

    console.log(`課題抽出対象データ長: ${truncatedData.length}文字, モデル: ${model}`);
    console.log('=== 会話データサンプル（最初の500文字） ===');
    console.log(truncatedData.substring(0, 500) + '...');
    console.log('=== 会話データサンプル終了 ===');

    console.log('=== ChatGPT API 呼び出し開始 ===');
    console.log('使用モデル:', model);
    
    // GPT-5の利用可能性チェック
    if (model === 'gpt-5-mini-2025-08-07') {
      console.log('GPT-5モデルを使用中...');
      try {
        await openai.chat.completions.create({
          model: 'gpt-5-mini-2025-08-07',
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 10
        });
        console.log('GPT-5が利用可能、課題抽出に使用');
      } catch (error: any) {
        console.warn(`GPT-5が利用できません: ${error.message}, GPT-4oにフォールバック`);
        model = 'gpt-4o';
      }
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `あなたは企業の事業課題を抽出する専門家です。会話データから${companyName}が抱えている事業課題を抽出・分析し、企業の成長と改善に繋がる具体的な問題点を明確にしてください。`
        },
        {
          role: 'user',
          content: `以下の会話データから「${companyName}」が抱えている事業課題を箇条書きで5〜10個抽出してください。

事業課題とは、企業の売上、利益、成長に直接的な影響を与える問題や機会を指します。
例えば、新規顧客獲得の困難、市場シェアの低下、製品開発の遅れ、競合の台頭などが含まれます。

以下の点は事業課題から除外してください:
- 個々の顧客とのやり取りや特定の契約に関する問題
- 社内の日常的な業務連絡や手続きの遅延
- 担当者レベルのコミュニケーションや引継ぎの問題

良い抽出例:
- 新規事業のアイデアが不足しており、新たな収益源の確保ができていない。
- 主力製品の市場競争力が低下し、売上が伸び悩んでいる。
- 若手エンジニアの採用が難航し、開発チームの増強が計画通りに進んでいない。

悪い抽出例:
- 担当者が頻繁に休職し、引き継ぎが不十分。
- 顧客へのサービス内容の説明が不足している。
- 契約期間の管理が徹底されていない。

会話データ:
${truncatedData}`
        }
      ],
      ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
      ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
    });

    console.log('API レスポンス状態: 成功');
    console.log('API レスポンスデータ:', JSON.stringify(completion, null, 2));

    const challengesText = completion.choices[0]?.message?.content;
    const finishReason = completion.choices[0]?.finish_reason;
    
    console.log('=== ChatGPT 課題抽出レスポンス ===');
    console.log('生のレスポンス:', challengesText);
    console.log('レスポンス長:', challengesText?.length || 0, '文字');
    console.log('終了理由:', finishReason);

    console.log('PARSING CHALLENGES');
    console.log(challengesText);
    
    if (!challengesText || challengesText.trim() === '') {
      if (finishReason === 'length') {
        // セカンダリAPIキーがある場合は試行
        if (!useSecondaryKey && process.env.OPENAI_API_KEY2) {
          console.log('トークン制限に達しました。OPENAI_API_KEY2で再試行します。');
          return await extractChallengesFromConversation(conversationData, companyName, true);
        } else {
          // 簡単な課題を生成して返す（無限ループを防ぐ）
          console.log('トークン制限に達しました。一般的な課題を返します。');
          return [`${companyName}の営業効率化・デジタル化に関する課題`, `${companyName}の人材確保・スキルアップに関する課題`];
        }
      } else {
        throw new Error(`ChatGPTが空のレスポンスを返しました (終了理由: ${finishReason})`);
      }
    }
    
    // 箇条書きから配列に変換
    const challenges = challengesText
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))
      .map((line: string) => line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
      .filter((challenge: string) => challenge.length > 0);

    console.log('=== 抽出された課題一覧 ===');
    challenges.forEach((challenge: string, index: number) => {
      console.log(`${index + 1}. ${challenge}`);
      console.log(`   長さ: ${challenge.length}文字`);
      console.log(`   内容詳細: "${challenge}"`);
      console.log('---');
    });
    console.log(`総課題数: ${challenges.length}`);

    return challenges;
  } catch (error) {
    console.error('Challenge extraction error:', error);
    return [`課題抽出エラー: ${getErrorMessage(error)}`];
  }
}

// 総合課題マッチング - すべての課題を考慮して最適な企業を選出
async function findMatchingCompanies(challenges: string[]): Promise<any[]> {
  try {
    console.log('=== 総合課題マッチング開始 ===');
    console.log(`課題数: ${challenges.length}`);
    challenges.forEach((challenge, index) => {
      console.log(`課題${index + 1}: ${challenge}`);
    });

    console.log('🔄 直接関数呼び出しでマッチング処理実行');
    
    const result = await comprehensiveMatchChallenges(challenges);
    console.log(`✅ 総合マッチング結果: ${result.totalMatches}社が選出されました`);
    
    if (result.comprehensiveMatches && result.comprehensiveMatches.length > 0) {
      console.log('選出企業詳細:');
      result.comprehensiveMatches.forEach((match: any, index: number) => {
        console.log(`  ${index + 1}位: ${match.company_name} (総合スコア: ${match.total_score.toFixed(3)})`);
        console.log(`    対応領域: 営業${match.coverage_areas.sales_acquisition ? '○' : '×'} / マーケ${match.coverage_areas.marketing_strategy ? '○' : '×'} / デジタル${match.coverage_areas.digital_performance ? '○' : '×'}`);
      });
    }

    // 総合マッチング結果を従来の形式に変換
    return [{
      challenges: challenges,
      matches: result.comprehensiveMatches || [],
      matchingMethod: 'comprehensive-matching',
      totalScore: result.comprehensiveMatches?.reduce((sum: number, match: any) => sum + match.total_score, 0) || 0
    }];

  } catch (matchingError) {
    console.error(`🚨 総合マッチング処理エラー:`, matchingError);
    return [{
      challenges: challenges,
      matches: [],
      matchingMethod: 'comprehensive-matching',
      error: `Processing Error: ${getErrorMessage(matchingError)}`
    }];
  }
}

export async function POST(req: NextRequest) {
  let requestData: any = {};
  try {
    requestData = await req.json();
    const { 
      companyName, 
      conversationData, 
      columnLetter, 
      extractionMethod,
      sheetType = 'CL',
      excludeSpeakers,
      includeSpeakers,
      excludeKeywords
    } = requestData;
    
    if (!companyName || !conversationData) {
      return NextResponse.json({ 
        error: 'companyName and conversationData are required' 
      }, { status: 400 });
    }

    console.log(`=== ${companyName}の課題抽出・マッチング処理開始 ===`);
    console.log(`企業名: ${companyName}`);
    console.log(`列: ${columnLetter || '不明'}`);
    console.log(`抽出方法: ${extractionMethod || '不明'}`);
    console.log(`シートタイプ: ${sheetType}`);

    // 会話データの話者情報を分析
    const originalSpeakers = extractSpeakers(conversationData);
    console.log(`会話参加者: ${originalSpeakers.join(', ')}`);

    // 話者フィルターを適用（デフォルトフィルターを常に適用）
    let processedConversationData = conversationData;
    let filterStats = null;
    
    // デフォルトの除外話者リストと追加指定された除外話者を結合
    const allExcludeSpeakers = [
      ...DEFAULT_EXCLUDE_SPEAKERS,
      ...(excludeSpeakers || [])
    ];
    
    const filterOptions: FilterOptions = {
      excludeSpeakers: allExcludeSpeakers,
      includeSpeakers,
      excludeKeywords
    };
    
    const filterResult = filterConversationData(conversationData, filterOptions);
    processedConversationData = filterResult.filteredData;
    filterStats = {
      originalSpeakers: filterResult.originalSpeakers,
      includedSpeakers: filterResult.includedSpeakers,
      excludedSpeakers: filterResult.excludedSpeakers,
      includedLines: filterResult.includedLines,
      excludedLines: filterResult.excludedLines
    };
    
    console.log(`話者フィルター適用:`);
    console.log(`- 除外された話者: ${filterResult.excludedSpeakers.join(', ') || 'なし'}`);
    console.log(`- 残った話者: ${filterResult.includedSpeakers.join(', ')}`);
    console.log(`- 除外された発言: ${filterResult.excludedLines}件`);
    console.log(`- 残った発言: ${filterResult.includedLines}件`);

    // 1. 課題抽出
    console.log('課題抽出中...');
    const challenges = await extractChallengesFromConversation(processedConversationData, companyName);
    console.log(`抽出された課題数: ${challenges.length}`);

    // 2. マッチング
    console.log('マッチング処理中...');
    const matchingResults = await findMatchingCompanies(challenges);
    console.log(`マッチング結果: ${matchingResults.length}件の課題に対してマッチング完了`);

    // 総合マッチング結果を取得
    const comprehensiveResult = matchingResults[0]; // 総合マッチング結果（単一結果）
    const selectedCompanies = comprehensiveResult?.matches || [];

    const result = {
      success: true,
      companyName,
      columnLetter: columnLetter || '不明',
      extractionMethod: extractionMethod || '不明',
      challenges,
      comprehensiveMatches: selectedCompanies,
      matchingMethod: 'comprehensive-multi-challenge-evaluation',
      totalChallenges: challenges.length,
      selectedCompaniesCount: selectedCompanies.length,
      processedAt: new Date().toISOString(),
      filterStats,
      summary: {
        challengesExtracted: challenges.length,
        matchingApproach: '全課題を総合的に評価して最適企業を選出',
        selectedCompanies: selectedCompanies.length,
        topCompany: selectedCompanies.length > 0 ? selectedCompanies[0].company_name : null,
        speakerFiltering: filterStats ? {
          originalSpeakersCount: filterStats.originalSpeakers.length,
          includedSpeakersCount: filterStats.includedSpeakers.length,
          excludedSpeakersCount: filterStats.excludedSpeakers.length,
          filteredLinesCount: filterStats.includedLines,
          excludedLinesCount: filterStats.excludedLines
        } : null
      }
    };

    console.log(`✅ ${companyName}の課題抽出・総合マッチング処理完了`);
    console.log(`- 抽出課題数: ${challenges.length}`);
    console.log(`- 選出企業数: ${selectedCompanies.length}`);
    if (selectedCompanies.length > 0) {
      console.log(`- 最適企業: ${selectedCompanies[0].company_name} (スコア: ${selectedCompanies[0].total_score?.toFixed(3) || 'N/A'})`);
    }

    return NextResponse.json({
      ...result,
      sheetType
    });

  } catch (error: unknown) {
    console.error('単一企業の課題抽出・マッチング処理エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      companyName: requestData?.companyName || '不明',
      sheetType: requestData?.sheetType || 'CL',
      processedAt: new Date().toISOString()
    }, { status: 500 });
  }
}
