import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { searchPersonasBySymptom, searchPersonasAdvanced, getAllPersonas, getPersonaTables, getTableStructure } from '../../../../lib/snowflake-persona';

export async function POST(req: NextRequest) {
  try {
    const { extractedPersonas, companyName } = await req.json();

    if (!extractedPersonas || !companyName) {
      return NextResponse.json(
        { error: 'Extracted personas and company name are required' },
        { status: 400 }
      );
    }

    console.log('=== ペルソナベースターゲット検索開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log('抽出されたペルソナ:', JSON.stringify(extractedPersonas, null, 2));

    const results: any = {
      companyName,
      searchResults: [],
      summary: {
        totalTargets: 0,
        totalPersonas: 0,
        totalMatches: 0
      }
    };

    // 各ターゲット（業種）に対して処理
    if (extractedPersonas.targets && Array.isArray(extractedPersonas.targets)) {
      for (const target of extractedPersonas.targets) {
        console.log(`\n--- 業種: ${target.industry_normalized} の処理開始 ---`);
        
        const targetResult: any = {
          industry: target.industry_normalized,
          industryRaw: target.industry_raw,
          confidence: target.confidence_industry,
          personas: [],
          totalMatches: 0
        };

        // AI推論による段階的検索を実行
        console.log('=== AI推論による段階的検索開始 ===');
        const aiInferredConditions = await inferSearchConditions(target, companyName, extractedPersonas);
        console.log('AI推論条件:', aiInferredConditions);

        // 段階的検索を実行
        const stagedSearchResults = await performStagedSearch(aiInferredConditions);
        console.log(`段階的検索結果: ${stagedSearchResults.length}件`);

        if (stagedSearchResults.length > 0) {
          targetResult.personas.push({
            searchMethod: 'ai_inferred_staged',
            aiInferredConditions: aiInferredConditions,
            matches: stagedSearchResults,
            matchCount: stagedSearchResults.length,
            description: `AI推論による段階的検索結果（提案業種: ${aiInferredConditions.aiProposedIndustries?.join(', ') || 'なし'}）`,
            targetOrganizations: aiInferredConditions.targetOrganizations,
            aiProposedIndustries: aiInferredConditions.aiProposedIndustries
          });
          targetResult.totalMatches += stagedSearchResults.length;
        }

        // フォールバック: より広範囲な検索
        if (targetResult.totalMatches === 0) {
          console.log('段階的検索で結果なし、広範囲検索にフォールバック');
          
          // 複数のbusiness_tagで広範囲検索
          let broadSearchResults: any[] = [];
          for (const businessTag of aiInferredConditions.businessTags) {
            const tagResults = await searchPersonasAdvanced({
              businessTag: businessTag,
              limit: 100
            });
            broadSearchResults = broadSearchResults.concat(tagResults);
            if (broadSearchResults.length > 0) break; // 結果が見つかったら終了
          }
          
          if (broadSearchResults.length > 0) {
            targetResult.personas.push({
              searchMethod: 'broad_business_tag',
              businessTags: aiInferredConditions.businessTags,
              businessTag: aiInferredConditions.businessTag,
              matches: broadSearchResults,
              matchCount: broadSearchResults.length,
              description: '業種ベースの広範囲検索結果'
            });
            targetResult.totalMatches += broadSearchResults.length;
          }
        }

        // 最終フォールバック: 症状ベース検索
        if (targetResult.totalMatches === 0 && target.personas && Array.isArray(target.personas)) {
          console.log('広範囲検索でも結果なし、症状ベース検索にフォールバック');
          for (const persona of target.personas) {
            console.log(`ペルソナ検索: ${persona.persona_mapped || persona.persona_statement_raw}`);
            
            const symptomKeywords = extractSymptomKeywords(persona);
            console.log('抽出された症状キーワード:', symptomKeywords);

            if (symptomKeywords.length > 0) {
              try {
                const matches = await searchPersonasBySymptom(symptomKeywords, 50);
                
                if (matches.length > 0) {
                  targetResult.personas.push({
                    searchMethod: 'symptom_based',
                    personaStatement: persona.persona_statement_raw,
                    personaMapped: persona.persona_mapped,
                    confidence: persona.confidence,
                    evidenceSnippets: persona.evidence_snippets,
                    symptomKeywords,
                    matches: matches,
                    matchCount: matches.length,
                    description: '症状ベース検索結果'
                  });
                  targetResult.totalMatches += matches.length;
                }
              } catch (searchError) {
                console.error('ペルソナ検索エラー:', searchError);
              }
            }
          }
        }

        // データベースに該当データがない場合でも、推論されたターゲット組織情報を表示
        if (targetResult.totalMatches === 0 && aiInferredConditions.targetOrganizations && aiInferredConditions.targetOrganizations.length > 0) {
          console.log('データベースに該当データなし、推論されたターゲット組織情報を表示');
          targetResult.personas.push({
            searchMethod: 'ai_inferred_targets',
            aiInferredConditions: aiInferredConditions,
            matches: [],
            matchCount: 0,
            description: 'データベースに該当データなし、AI推論によるターゲット組織提案',
            targetOrganizations: aiInferredConditions.targetOrganizations,
            note: 'データベースに該当するデータが見つかりませんでしたが、企業の強み・特徴から推論されたターゲット組織を提案します。'
          });
        }

        // 最終手段: データベースAI分析を実行
        if (targetResult.totalMatches === 0) {
          console.log('最終手段: データベースAI分析を実行');
          try {
            const dbAnalysisResponse = await fetch(`${req.nextUrl.origin}/api/persona/analyze-database`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                extractedPersonas: target,
                companyName: companyName
              }),
            });

            if (dbAnalysisResponse.ok) {
              const dbAnalysisResult = await dbAnalysisResponse.json();
              console.log('データベースAI分析結果:', dbAnalysisResult);
              
              if (dbAnalysisResult.success && dbAnalysisResult.results.aiAnalysis.potentialTargets.length > 0) {
                targetResult.personas.push({
                  searchMethod: 'database_ai_analysis',
                  aiAnalysis: dbAnalysisResult.results.aiAnalysis,
                  databaseStats: dbAnalysisResult.results.databaseStats,
                  matches: [],
                  matchCount: dbAnalysisResult.results.aiAnalysis.potentialTargets.length,
                  description: 'データベースAI分析によるアプローチ先抽出',
                  note: 'データベースの情報のみを使用してAIが分析し、アプローチ先として可能性のあるものを抽出しました。'
                });
                targetResult.totalMatches += dbAnalysisResult.results.aiAnalysis.potentialTargets.length;
              }
            }
          } catch (dbAnalysisError) {
            console.error('データベースAI分析エラー:', dbAnalysisError);
          }
        }

        results.searchResults.push(targetResult);
        results.summary.totalTargets++;
        results.summary.totalPersonas += target.personas?.length || 0;
        results.summary.totalMatches += targetResult.totalMatches;
        
        console.log(`--- 業種: ${target.industry_normalized} の処理完了 (${targetResult.totalMatches}件のマッチ) ---`);
      }
    }

    console.log('=== ペルソナベースターゲット検索完了 ===');
    console.log(`総マッチ数: ${results.summary.totalMatches}件`);

    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナベースターゲット検索が完了しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナベースターゲット検索エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナベースターゲット検索失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * ペルソナから症状キーワードを抽出する
 */
function extractSymptomKeywords(persona: any): string[] {
  const keywords: string[] = [];
  
  // persona_statement_rawから症状を抽出
  if (persona.persona_statement_raw) {
    const symptoms = extractSymptomsFromText(persona.persona_statement_raw);
    keywords.push(...symptoms);
  }
  
  // persona_mappedから症状を抽出
  if (persona.persona_mapped && persona.persona_mapped !== persona.persona_statement_raw) {
    const symptoms = extractSymptomsFromText(persona.persona_mapped);
    keywords.push(...symptoms);
  }
  
  // 重複を除去
  return [...new Set(keywords)];
}

/**
 * テキストから症状キーワードを抽出する
 */
function extractSymptomsFromText(text: string): string[] {
  if (!text) return [];
  
  // 一般的な症状・課題キーワード
  const symptomPatterns = [
    // 効率性・生産性関連
    /効率(?:性|化|的)/g,
    /生産性/g,
    /業務(?:効率|改善|最適化)/g,
    /手作業/g,
    /非効率/g,
    /時間(?:短縮|削減|節約)/g,
    
    // システム・IT関連
    /システム(?:化|導入|更新)/g,
    /自動化/g,
    /デジタル(?:化|変革)/g,
    /DX/g,
    /IT(?:化|導入)/g,
    
    // 管理・運用関連
    /管理(?:不足|困難|複雑)/g,
    /運用(?:コスト|負荷|困難)/g,
    /監視(?:不足|困難)/g,
    /追跡(?:困難|不足)/g,
    
    // データ関連
    /データ(?:管理|分析|活用)/g,
    /情報(?:共有|管理|不足)/g,
    /レポート(?:作成|分析)/g,
    
    // コミュニケーション関連
    /連携(?:不足|困難)/g,
    /コミュニケーション/g,
    /情報(?:共有|伝達)/g,
    
    // コスト関連
    /コスト(?:削減|増加|管理)/g,
    /費用(?:削減|増加)/g,
    /予算(?:管理|不足)/g,
    
    // 品質関連
    /品質(?:管理|向上|低下)/g,
    /エラー(?:削減|防止)/g,
    /ミス(?:削減|防止)/g
  ];
  
  const symptoms: string[] = [];
  
  for (const pattern of symptomPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      symptoms.push(...matches);
    }
  }
  
  // 単語レベルでの抽出も試行
  const words = text.split(/[、。\s\n]/).filter(word => word.length > 1);
  const symptomKeywords = [
    '効率', '生産性', '自動化', 'システム', '管理', '運用', 'データ', 
    '情報', '連携', 'コスト', '品質', 'エラー', 'ミス', '手作業',
    '非効率', '困難', '不足', '複雑', '負荷', '監視', '追跡'
  ];
  
  for (const word of words) {
    for (const keyword of symptomKeywords) {
      if (word.includes(keyword)) {
        symptoms.push(word);
      }
    }
  }
  
  return [...new Set(symptoms)];
}

/**
 * データベース情報を取得する（デバッグ用）
 */
export async function GET(req: NextRequest) {
  try {
    console.log('=== ペルソナデータベース情報取得 ===');
    
    const tables = await getPersonaTables();
    console.log('テーブル一覧:', tables);
    
    const results: any = {
      tables: tables,
      tableStructures: {}
    };
    
    // 各テーブルの構造を取得
    for (const table of tables) {
      try {
        const structure = await getTableStructure(table.TABLE_NAME);
        results.tableStructures[table.TABLE_NAME] = structure;
      } catch (error) {
        console.error(`テーブル ${table.TABLE_NAME} の構造取得エラー:`, error);
        results.tableStructures[table.TABLE_NAME] = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
    
    // サンプルデータを取得
    try {
      const sampleData = await getAllPersonas(5);
      results.sampleData = sampleData;
    } catch (error) {
      console.error('サンプルデータ取得エラー:', error);
      results.sampleData = { error: error instanceof Error ? error.message : 'Unknown error' };
    }
    
    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナデータベース情報を取得しました'
    });
    
  } catch (error: unknown) {
    console.error('ペルソナデータベース情報取得エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナデータベース情報取得失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * AIが推論した検索条件を生成
 */
async function inferSearchConditions(target: any, companyName: string, extractedPersonas: any): Promise<any> {
  // AIが企業のペルソナを分析して幅広い業種を提案
  const aiProposedIndustries = await analyzePersonaForIndustries(extractedPersonas, companyName);
  console.log('AI提案業種:', aiProposedIndustries);
  
  // 企業の強み・特徴からターゲット先を推論
  const targetInferences = inferTargetOrganizations(target);
  
  // AI提案業種からデータベースに既存のbusiness_tagを検索（最適化版）
  const matchingBusinessTags = await findMatchingBusinessTags(aiProposedIndustries, extractedPersonas);
  console.log('マッチした既存business_tag:', matchingBusinessTags);
  
  const inferredConditions = {
    businessTags: matchingBusinessTags, // データベースに既存のbusiness_tagのみ
    businessTag: matchingBusinessTags[0], // 最初のbusiness_tag（後方互換性のため）
    department: inferDepartment(aiProposedIndustries[0] || target.industry_normalized),
    sizeBand: inferSizeBand(aiProposedIndustries[0] || target.industry_normalized),
    symptoms: target.personas?.map((p: any) => p.persona_mapped || p.persona_statement_raw) || [],
    targetOrganizations: targetInferences,
    aiProposedIndustries: aiProposedIndustries // AI提案業種を追加
  };
  
  return inferredConditions;
}

/**
 * 実際のデータベースのbusiness_tagを読み込む関数
 */
async function loadActualDatabaseBusinessTags(): Promise<string[]> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const filePath = path.join(process.cwd(), 'business_tags_unique.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // ファイルの内容を行ごとに分割し、空行を除去
    const tags = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    return tags;
  } catch (error) {
    console.error('business_tags_unique.txtの読み込みエラー:', error);
    // フォールバック用の基本的なタグを返す
    return [
      'システム開発', 'ソフトウェア開発', 'Webアプリケーション開発', 'モバイルアプリ開発',
      '介護施設運営', '障害者支援施設運営', '社会福祉法人運営', '福祉システム開発',
      'クリニック(診療所)運営', '病院運営', '医療機器販売', '介護施設運営',
      '不動産任意売却', '不動産情報サイト運営', 'アパート賃貸', 'マンション賃貸'
    ];
  }
}

/**
 * 企業のペルソナに基づいて関連するbusiness_tagを事前にフィルタリング（RAG版）
 */
async function filterRelevantBusinessTags(extractedPersonas: any): Promise<string[]> {
  // RAGベースでデータベースのbusiness_tagから関連するものを直接選択
  const relevantTags = await selectRelevantBusinessTagsWithRAG(extractedPersonas);
  console.log(`RAG選択による関連business_tag: ${relevantTags.length}件`);
  return relevantTags;
}

/**
 * RAGベースでデータベースのbusiness_tagから関連するものを選択
 */
async function selectRelevantBusinessTagsWithRAG(extractedPersonas: any): Promise<string[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // データベースのbusiness_tagを取得
  const allBusinessTags = await loadActualDatabaseBusinessTags();
  
  // AIを使って最適なターゲット先のbusiness_tagを選択
  const sampleSize = Math.min(200, allBusinessTags.length);
  const sampleTags = await selectOptimalBusinessTagsWithAI(extractedPersonas, allBusinessTags, sampleSize);
  
  // ペルソナからテキストを抽出
  const personaTexts = extractPersonaTexts(extractedPersonas);
  
  const prompt = `あなたは営業戦略コンサルタントです。企業のペルソナ（解決できる課題）を分析して、提供された最適化されたbusiness_tagの中から、最も営業ターゲットとして適切なものを最終選択してください。

【企業のペルソナ情報】
${personaTexts}

【AI事前選択されたbusiness_tag（最適化済み）】
${sampleTags.join(', ')}

【重要】以下の条件を満たすbusiness_tagを最終選択してください：
1. ペルソナの内容と最も関連性が高い
2. 営業ターゲットとして実現可能性が高い
3. 10-15個程度に絞り込む
4. 優先度の高いものから順番に選択

選択したbusiness_tagを配列形式で出力してください。

例: ["決済代行", "ECサイト運営", "システム開発", "Webアプリケーション開発"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "あなたはデータベース検索の専門家です。提供されたデータベースのbusiness_tagの中から、企業のペルソナに関連するものを選択してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return getFallbackBusinessTags(allBusinessTags);
    }

    // JSON配列をパース
    try {
      const selectedTags = JSON.parse(response);
      if (Array.isArray(selectedTags)) {
        // 選択されたタグが実際にデータベースに存在するかチェック
        const validTags = selectedTags.filter(tag => allBusinessTags.includes(tag));
        console.log(`RAG選択結果: ${validTags.length}件 / 提案${selectedTags.length}件`);
        return validTags.length > 0 ? validTags : getFallbackBusinessTags(allBusinessTags);
      }
      return getFallbackBusinessTags(allBusinessTags);
    } catch (parseError) {
      console.error('RAG分析結果のパースエラー:', parseError);
      return getFallbackBusinessTags(allBusinessTags);
    }
  } catch (error) {
    console.error('RAG分析エラー:', error);
    return getFallbackBusinessTags(allBusinessTags);
  }
}

/**
 * AIを使ってペルソナに基づいて最適なターゲット先のbusiness_tagを選択
 */
async function selectOptimalBusinessTagsWithAI(extractedPersonas: any, allBusinessTags: string[], sampleSize: number): Promise<string[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ペルソナからテキストを抽出
  const personaTexts = extractPersonaTexts(extractedPersonas);
  
  // 全タグをカテゴリ別に分類
  const categorizedTags = categorizeBusinessTags(allBusinessTags);
  
  const prompt = `あなたは営業戦略コンサルタントです。企業のペルソナ（解決できる課題）を分析して、その企業がアプローチすべき最適なターゲット先のbusiness_tagを選択してください。

【企業のペルソナ情報】
${personaTexts}

【データベースのbusiness_tag（カテゴリ別）】
${JSON.stringify(categorizedTags, null, 2)}

【重要】以下の条件を満たすbusiness_tagを選択してください：
1. ペルソナの内容と最も関連性が高い
2. 営業ターゲットとして適切
3. 多様性を考慮（1つのカテゴリに偏らない）
4. 実現可能性が高い
5. 最大${sampleSize}個まで選択

選択したbusiness_tagを配列形式で出力してください。

例: ["決済代行", "ECサイト運営", "システム開発", "Webアプリケーション開発", "ITコンサルティング"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "あなたは営業戦略コンサルタントです。企業のペルソナを分析して、最適なターゲット先のbusiness_tagを選択してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return getFallbackBusinessTags(allBusinessTags).slice(0, sampleSize);
    }

    // JSON配列をパース
    try {
      const selectedTags = JSON.parse(response);
      if (Array.isArray(selectedTags)) {
        // 選択されたタグが実際にデータベースに存在するかチェック
        const validTags = selectedTags.filter(tag => allBusinessTags.includes(tag));
        console.log(`AI最適選択結果: ${validTags.length}件 / 提案${selectedTags.length}件`);
        return validTags.length > 0 ? validTags : getFallbackBusinessTags(allBusinessTags).slice(0, sampleSize);
      }
      return getFallbackBusinessTags(allBusinessTags).slice(0, sampleSize);
    } catch (parseError) {
      console.error('AI最適選択結果のパースエラー:', parseError);
      return getFallbackBusinessTags(allBusinessTags).slice(0, sampleSize);
    }
  } catch (error) {
    console.error('AI最適選択エラー:', error);
    return getFallbackBusinessTags(allBusinessTags).slice(0, sampleSize);
  }
}

/**
 * business_tagをカテゴリ別に分類
 */
function categorizeBusinessTags(allBusinessTags: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'システム・IT関連': [],
    '介護・福祉関連': [],
    '医療・健康関連': [],
    '不動産関連': [],
    '製造・工場関連': [],
    '教育・研修関連': [],
    '建設・建築関連': [],
    '金融・保険関連': [],
    '小売・流通関連': [],
    'その他サービス': []
  };

  const categoryKeywords = {
    'システム・IT関連': ['システム', 'ソフトウェア', 'Web', 'アプリ', 'IT', 'デジタル', 'DX', 'EC', '決済', 'オンライン', '開発', 'プログラミング'],
    '介護・福祉関連': ['介護', '福祉', '障害者', '施設', '支援', 'グループホーム', 'NPO', '社会福祉', 'ケア', '高齢者'],
    '医療・健康関連': ['医療', '病院', 'クリニック', '診療', '健康', '看護', 'リハビリ', '薬局', '医療機器'],
    '不動産関連': ['不動産', '賃貸', '売買', 'マンション', 'アパート', '住宅', '物件', '土地', '建物'],
    '製造・工場関連': ['製造', '工場', '生産', '加工', '組立', '検査', '品質管理', '自動化', '機械'],
    '教育・研修関連': ['教育', '学習', '学校', '塾', 'スクール', '研修', '資格', '人材育成', '講座'],
    '建設・建築関連': ['建設', '建築', '工事', '設計', '施工', 'リフォーム', '新築', '土木'],
    '金融・保険関連': ['金融', '保険', '銀行', '証券', '投資', 'ローン', '資産運用', 'クレジット'],
    '小売・流通関連': ['販売', '小売', 'EC', 'オンライン', '店舗', '流通', '卸売', '商社'],
    'その他サービス': ['コンサルティング', '人材', '派遣', 'サービス', 'BPO', '清掃', '警備', '広告']
  };

  for (const tag of allBusinessTags) {
    let categorized = false;
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => tag.includes(keyword))) {
        categories[category].push(tag);
        categorized = true;
        break;
      }
    }
    
    if (!categorized) {
      categories['その他サービス'].push(tag);
    }
  }

  // 各カテゴリのタグ数を制限（AIの処理能力を考慮）
  for (const category in categories) {
    if (categories[category].length > 50) {
      categories[category] = categories[category].slice(0, 50);
    }
  }

  return categories;
}

/**
 * 多様なbusiness_tagのサンプルを取得（非推奨）
 * @deprecated この関数は使用しない。selectOptimalBusinessTagsWithAIを使用すること。
 */
function getDiverseBusinessTagSample(allBusinessTags: string[], sampleSize: number): string[] {
  const categories = {
    'システム・IT': ['システム', 'ソフトウェア', 'Web', 'アプリ', 'IT', 'デジタル', 'DX', 'EC', '決済', 'オンライン'],
    '介護・福祉': ['介護', '福祉', '障害者', '施設', '支援', 'グループホーム', 'NPO', '社会福祉'],
    '医療・健康': ['医療', '病院', 'クリニック', '診療', '健康', '看護', 'リハビリ'],
    '不動産': ['不動産', '賃貸', '売買', 'マンション', 'アパート', '住宅', '物件'],
    '製造・工場': ['製造', '工場', '生産', '加工', '組立', '検査', '品質管理', '自動化'],
    '教育・研修': ['教育', '学習', '学校', '塾', 'スクール', '研修', '資格', '人材育成'],
    '建設・建築': ['建設', '建築', '工事', '設計', '施工', 'リフォーム', '新築'],
    '金融・保険': ['金融', '保険', '銀行', '証券', '投資', 'ローン', '資産運用'],
    '小売・流通': ['販売', '小売', 'EC', 'オンライン', '店舗', '流通'],
    'その他': ['コンサルティング', '人材', '派遣', 'サービス', 'BPO']
  };
  
  const sampledTags: string[] = [];
  const tagsPerCategory = Math.floor(sampleSize / Object.keys(categories).length);
  
  for (const [category, keywords] of Object.entries(categories)) {
    const categoryTags: string[] = [];
    
    for (const keyword of keywords) {
      const matchingTags = allBusinessTags.filter(tag => tag.includes(keyword));
      categoryTags.push(...matchingTags);
    }
    
    // 重複を除去してランダムに選択
    const uniqueCategoryTags = [...new Set(categoryTags)];
    const shuffled = uniqueCategoryTags.sort(() => Math.random() - 0.5);
    sampledTags.push(...shuffled.slice(0, tagsPerCategory));
  }
  
  // 残りのスロットをランダムに埋める
  const remainingSlots = sampleSize - sampledTags.length;
  if (remainingSlots > 0) {
    const usedTags = new Set(sampledTags);
    const availableTags = allBusinessTags.filter(tag => !usedTags.has(tag));
    const shuffled = availableTags.sort(() => Math.random() - 0.5);
    sampledTags.push(...shuffled.slice(0, remainingSlots));
  }
  
  return sampledTags;
}

/**
 * ペルソナからテキストを抽出
 */
function extractPersonaTexts(extractedPersonas: any): string {
  const texts: string[] = [];
  
  if (extractedPersonas?.targets) {
    for (const target of extractedPersonas.targets) {
      if (target.personas) {
        for (const persona of target.personas) {
          const personaText = persona.persona_mapped || persona.persona_statement_raw || '';
          if (personaText) {
            texts.push(personaText);
          }
        }
      }
    }
  }
  
  return texts.join(' ');
}

/**
 * フォールバック用のbusiness_tagを取得
 */
function getFallbackBusinessTags(allBusinessTags: string[]): string[] {
  // 一般的なタグを優先的に選択
  const commonKeywords = ['システム', '開発', 'EC', '決済', 'Web', 'IT', '介護', '医療', '不動産'];
  const fallbackTags: string[] = [];
  
  for (const keyword of commonKeywords) {
    const matchingTags = allBusinessTags.filter(tag => tag.includes(keyword));
    fallbackTags.push(...matchingTags.slice(0, 3)); // 各キーワードから最大3個
  }
  
  // 重複を除去して最大20個に制限
  return [...new Set(fallbackTags)].slice(0, 20);
}

/**
 * AIにペルソナを分析させて関連するタグカテゴリを判断（非推奨）
 * @deprecated この関数は使用しない。selectRelevantBusinessTagsWithRAGを使用すること。
 */
async function analyzePersonaForTagCategories(extractedPersonas: any): Promise<string[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `あなたはデータベース検索の専門家です。企業のペルソナ（解決できる課題）を分析して、データベースから関連するbusiness_tagを検索する際に使用すべきキーワードを提案してください。

企業のペルソナ情報:
${JSON.stringify(extractedPersonas, null, 2)}

【重要】ペルソナの内容を分析して、以下の観点から関連するキーワードを提案してください：

1. 決済・支払い関連: 決済、手数料、支払い、EC、オンライン、クレジット、デビット、電子マネー
2. システム・IT関連: システム、カスタマイズ、開発、Web、ソフトウェア、IT、デジタル、DX
3. 飲食・小売関連: 飲食、レストラン、カフェ、店舗、販売、小売、EC、オンライン
4. 介護・福祉関連: 介護、福祉、障害者、施設、支援、グループホーム、NPO、社会福祉
5. 医療・健康関連: 医療、病院、クリニック、診療、健康、看護、リハビリ
6. 不動産関連: 不動産、賃貸、売買、マンション、アパート、住宅、物件
7. 製造・工場関連: 製造、工場、生産、加工、組立、検査、品質管理、自動化
8. 教育・研修関連: 教育、学習、学校、塾、スクール、研修、資格、人材育成
9. 建設・建築関連: 建設、建築、工事、設計、施工、リフォーム、新築
10. 金融・保険関連: 金融、保険、銀行、証券、投資、ローン、資産運用

ペルソナの内容に基づいて、最も関連性の高いキーワードを5-10個提案してください。
キーワードのみを配列形式で出力してください。

例: ["決済", "手数料", "EC", "オンライン", "システム", "Web", "カスタマイズ"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "あなたはデータベース検索の専門家です。企業のペルソナを分析して、関連するbusiness_tagを検索するためのキーワードを提案してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return ['システム', '開発', 'IT']; // フォールバック
    }

    // JSON配列をパース
    try {
      const keywords = JSON.parse(response);
      return Array.isArray(keywords) ? keywords : ['システム', '開発', 'IT'];
    } catch (parseError) {
      console.error('AI分析結果のパースエラー:', parseError);
      return ['システム', '開発', 'IT'];
    }
  } catch (error) {
    console.error('AIペルソナ分析エラー:', error);
    return ['システム', '開発', 'IT'];
  }
}

/**
 * ペルソナからキーワードを抽出（非推奨）
 * @deprecated この関数は使用しない。analyzePersonaForTagCategoriesを使用すること。
 */
function extractPersonaKeywords(extractedPersonas: any): string[] {
  const keywords: string[] = [];
  
  if (extractedPersonas?.targets) {
    for (const target of extractedPersonas.targets) {
      if (target.personas) {
        for (const persona of target.personas) {
          const personaText = persona.persona_mapped || persona.persona_statement_raw || '';
          
          // 決済関連
          if (personaText.includes('決済') || personaText.includes('手数料') || personaText.includes('支払い')) {
            keywords.push('決済', '手数料', '支払い', 'EC', 'オンライン', 'システム', 'Web');
          }
          
          // システム関連
          if (personaText.includes('システム') || personaText.includes('カスタマイズ') || personaText.includes('開発')) {
            keywords.push('システム', 'カスタマイズ', '開発', 'Web', 'ソフトウェア', 'IT');
          }
          
          // 飲食店関連
          if (personaText.includes('飲食') || personaText.includes('レストラン') || personaText.includes('カフェ')) {
            keywords.push('飲食', 'レストラン', 'カフェ', '店舗', '販売');
          }
          
          // 介護関連
          if (personaText.includes('介護') || personaText.includes('福祉') || personaText.includes('障害者')) {
            keywords.push('介護', '福祉', '障害者', '施設', '支援');
          }
          
          // 医療関連
          if (personaText.includes('医療') || personaText.includes('病院') || personaText.includes('クリニック')) {
            keywords.push('医療', '病院', 'クリニック', '診療');
          }
          
          // 不動産関連
          if (personaText.includes('不動産') || personaText.includes('賃貸') || personaText.includes('マンション')) {
            keywords.push('不動産', '賃貸', 'マンション', 'アパート');
          }
        }
      }
    }
  }
  
  // 重複を除去
  return [...new Set(keywords)];
}

/**
 * タグがペルソナと関連するかチェック
 */
function isTagRelevantToPersona(tag: string, personaKeywords: string[]): boolean {
  for (const keyword of personaKeywords) {
    if (tag.includes(keyword)) {
      return true;
    }
  }
  return false;
}
  

/**
 * AIが企業のペルソナを分析して幅広い業種を提案する
 */
async function analyzePersonaForIndustries(extractedPersonas: any, companyName: string): Promise<string[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `あなたは営業戦略コンサルタントです。企業のペルソナ（解決できる課題）を分析して、その企業がアプローチすべき業種を提案してください。

企業名: ${companyName}
ペルソナ情報:
${JSON.stringify(extractedPersonas, null, 2)}

【重要】企業のペルソナに基づいて、その企業のサービスが解決できる課題を抱えている業種を提案してください。IT企業もあれば介護企業もあるので、それぞれの企業に合ったターゲット先を提案してください。

以下の観点から、アプローチすべき業種を提案してください：

1. IT・システム開発（システム導入していない企業、デジタル化が進んでいない企業）
2. 小売業（EC化していない小売店、決済システムが古い企業）
3. 製造業（IT化が進んでいない製造業、システム導入していない工場）
4. 金融（決済システムが古い金融機関、デジタル化が進んでいない企業）
5. 福祉・介護関連（介護施設、障害者支援施設、社会福祉法人など）
6. 医療・リハビリ関係（病院、クリニック、リハビリ施設など）
7. 行政・自治体関連（市区町村、地域包括支援センターなど）
8. 教育（学校、塾、研修機関など）
9. 建設業（建設会社、設計事務所など）
10. 不動産（不動産会社、賃貸管理会社など）
11. その他の業種（企業のペルソナに基づいて関連性の高い業種）

企業のペルソナに基づいて、最も関連性の高い業種を3-5個提案してください。
業種名のみを配列形式で出力してください。

例: ["IT・システム開発", "小売業", "製造業"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "あなたは営業戦略コンサルタントです。企業のペルソナを分析して、アプローチすべき業種を幅広く提案してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return ['その他'];
    }

    // JSON配列をパース
    try {
      const industries = JSON.parse(response);
      return Array.isArray(industries) ? industries : ['その他'];
    } catch (parseError) {
      console.error('業種提案のパースエラー:', parseError);
      return ['その他'];
    }
  } catch (error) {
    console.error('AI業種分析エラー:', error);
    return ['その他'];
  }
}

/**
 * AI提案業種からデータベースに既存のbusiness_tagを検索（最適化版）
 */
async function findMatchingBusinessTags(aiProposedIndustries: string[], extractedPersonas: any): Promise<string[]> {
  // まず、ペルソナに基づいて関連するタグを事前フィルタリング
  const relevantTags = await filterRelevantBusinessTags(extractedPersonas);
  console.log(`事前フィルタリング後の関連タグ: ${relevantTags.length}件`);
  
  const matchingTags: string[] = [];
  
  // フィルタリングされたタグから業種にマッチするものを検索
  for (const industry of aiProposedIndustries) {
    const tags = await findExistingBusinessTagsForIndustryFromFiltered(industry, relevantTags);
    matchingTags.push(...tags);
  }
  
  // 重複を除去
  return [...new Set(matchingTags)];
}

/**
 * フィルタリングされたタグから業種にマッチするものを検索（最適化版）
 */
function findExistingBusinessTagsForIndustryFromFiltered(industry: string, filteredTags: string[]): string[] {
  const industryKeywordMapping: Record<string, string[]> = {
    // IT・システム関連
    'IT・システム開発': ['システム', 'ソフトウェア', 'Web', 'アプリ', 'IT', 'デジタル', 'DX', 'EC', '決済', 'オンライン'],
    '小売業': ['EC', 'オンライン', '販売', '決済', 'システム', 'IT', 'デジタル'],
    '製造業': ['製造', '工場', 'システム', 'IT', 'デジタル', '自動化'],
    '金融': ['金融', '決済', 'システム', 'IT', 'デジタル', 'オンライン'],
    
    // 福祉・介護関連
    '行政・自治体': ['行政', '自治体', '公共', '福祉', '介護', '障害者'],
    '福祉事業所・支援団体': ['福祉', '介護', '障害者', 'グループホーム', 'NPO', '社会福祉'],
    '医療・リハビリ関係': ['医療', '病院', 'クリニック', 'リハビリ', '介護'],
    '保険・法律・金融関連': ['保険', '法律', '金融', '弁護士', '司法書士', '成年後見'],
    '地域包括支援': ['福祉', '介護', 'ケア', '社会福祉', '地域'],
    
    // その他の業種
    '教育': ['教育', '学習', '学校', '塾', 'スクール', '研修'],
    '建設業': ['建設', '建築', '工事', '設計', '施工'],
    '不動産': ['不動産', '賃貸', '売買', 'マンション', 'アパート'],
    '卸売業': ['卸売', '卸', '商社', '貿易'],
    'サービス業': ['サービス', 'コンサルティング', '人材', '派遣']
  };
  
  const keywords = industryKeywordMapping[industry] || [];
  const matchingTags: string[] = [];
  
  // フィルタリングされたタグからキーワードにマッチするものを検索
  for (const tag of filteredTags) {
    for (const keyword of keywords) {
      if (tag.includes(keyword)) {
        matchingTags.push(tag);
        break; // 1つのキーワードにマッチしたら次のタグへ
      }
    }
  }
  
  return matchingTags;
}

/**
 * 業種カテゴリに対応する既存のbusiness_tagを検索（非最適化版）
 * @deprecated この関数は使用しない。findExistingBusinessTagsForIndustryFromFilteredを使用すること。
 */
async function findExistingBusinessTagsForIndustry(industry: string): Promise<string[]> {
  const industryKeywordMapping: Record<string, string[]> = {
    // IT・システム関連
    'IT・システム開発': ['システム', 'ソフトウェア', 'Web', 'アプリ', 'IT', 'デジタル', 'DX', 'EC', '決済', 'オンライン'],
    '小売業': ['EC', 'オンライン', '販売', '決済', 'システム', 'IT', 'デジタル'],
    '製造業': ['製造', '工場', 'システム', 'IT', 'デジタル', '自動化'],
    '金融': ['金融', '決済', 'システム', 'IT', 'デジタル', 'オンライン'],
    
    // 福祉・介護関連
    '行政・自治体': ['行政', '自治体', '公共', '福祉', '介護', '障害者'],
    '福祉事業所・支援団体': ['福祉', '介護', '障害者', 'グループホーム', 'NPO', '社会福祉'],
    '医療・リハビリ関係': ['医療', '病院', 'クリニック', 'リハビリ', '介護'],
    '保険・法律・金融関連': ['保険', '法律', '金融', '弁護士', '司法書士', '成年後見'],
    '地域包括支援': ['福祉', '介護', 'ケア', '社会福祉', '地域'],
    
    // その他の業種
    '教育': ['教育', '学習', '学校', '塾', 'スクール', '研修'],
    '建設業': ['建設', '建築', '工事', '設計', '施工'],
    '不動産': ['不動産', '賃貸', '売買', 'マンション', 'アパート'],
    '卸売業': ['卸売', '卸', '商社', '貿易'],
    'サービス業': ['サービス', 'コンサルティング', '人材', '派遣']
  };
  
  const keywords = industryKeywordMapping[industry] || [];
  const matchingTags: string[] = [];
  
  // 実際のデータベースタグからキーワードにマッチするものを検索
  const allBusinessTags = await loadActualDatabaseBusinessTags();
  for (const tag of allBusinessTags) {
    for (const keyword of keywords) {
      if (tag.includes(keyword)) {
        matchingTags.push(tag);
        break; // 1つのキーワードにマッチしたら次のタグへ
      }
    }
  }
  
  return matchingTags;
}

/**
 * 業種から商材を推論（実際のデータベースのbusiness_tagに基づく）
 * @deprecated この関数は使用しない。findMatchingBusinessTagsを使用すること。
 */
function inferBusinessTag(industry: string): string[] {
  // 後方互換性のため残すが、実際には使用しない
  return ['その他'];
}

/**
 * 業種から部署を推論
 */
function inferDepartment(industry: string): string {
  const departmentMapping: Record<string, string> = {
    '支援機関': '総務管理',
    '製造業': '製造工場',
    'IT・システム開発': 'システム',
    '小売業': '営業',
    '卸売業': '営業',
    '建設業': '営業',
    '医療・福祉': '総務管理',
    '教育': '総務管理',
    '金融': '営業',
    '不動産': '営業',
    '福祉': '総務管理',
    '介護': '総務管理',
    '障害者支援': '総務管理',
    '社会福祉': '総務管理'
  };
  
  return departmentMapping[industry] || '営業';
}

/**
 * 業種から規模帯を推論
 */
function inferSizeBand(industry: string): string {
  const sizeMapping: Record<string, string> = {
    '支援機関': '10～30',
    '製造業': '50～100',
    'IT・システム開発': '30～50',
    '小売業': '10～30',
    '卸売業': '30～50',
    '建設業': '30～50',
    '医療・福祉': '30～50',
    '教育': '10～30',
    '金融': '50～100',
    '不動産': '10～30',
    '福祉': '10～30',
    '介護': '10～30',
    '障害者支援': '10～30',
    '社会福祉': '10～30'
  };
  
  return sizeMapping[industry] || '30～50';
}

/**
 * 企業の強み・特徴からターゲット先組織を推論
 */
function inferTargetOrganizations(target: any): any[] {
  const personas = target.personas || [];
  const targetOrganizations = [];
  
  // 各ペルソナからターゲット先を推論
  for (const persona of personas) {
    const personaText = persona.persona_mapped || persona.persona_statement_raw || '';
    
    // 障害者支援関連のキーワードを検出
    if (personaText.includes('障害者') || personaText.includes('入居拒否') || personaText.includes('住居')) {
      targetOrganizations.push({
        category: '行政・自治体',
        organizations: [
          { name: '市区町村の福祉課・障害福祉課', reason: '障害者の住まい相談の窓口' },
          { name: '地域包括支援センター', reason: '高齢・障害・生活困難者の住居相談' }
        ],
        businessTag: '福祉・介護',
        department: '総務管理',
        sizeBand: '10～30'
      });
      
      targetOrganizations.push({
        category: '福祉事業所・支援団体',
        organizations: [
          { name: '就労支援事業所', reason: '利用者の自立・就職時の住居ニーズ' },
          { name: '障害者グループホーム運営法人', reason: 'グループホームから一人暮らし移行' },
          { name: 'NPO・社会福祉法人', reason: '障害者支援活動との連携' }
        ],
        businessTag: '福祉・介護',
        department: '総務管理',
        sizeBand: '10～30'
      });
      
      targetOrganizations.push({
        category: '医療・リハビリ関係',
        organizations: [
          { name: '病院（精神科・リハビリ科）', reason: '退院後の住居先確保' },
          { name: '地域医療連携室', reason: '患者の住居先探し支援' }
        ],
        businessTag: '医療・福祉',
        department: '総務管理',
        sizeBand: '30～50'
      });
    }
    
    // 物件情報の可視化関連
    if (personaText.includes('可視化') || personaText.includes('現地訪問') || personaText.includes('情報')) {
      targetOrganizations.push({
        category: '保険・法律・金融関連',
        organizations: [
          { name: '成年後見人・弁護士・司法書士', reason: '障害者の財産管理・契約サポート' },
          { name: '社会福祉士・ケアマネジャー', reason: '生活全般支援・住宅ニーズ情報' }
        ],
        businessTag: '金融・保険',
        department: '営業',
        sizeBand: '10～30'
      });
    }
  }
  
  return targetOrganizations;
}

/**
 * 段階的検索を実行
 */
async function performStagedSearch(conditions: any): Promise<any[]> {
  try {
    console.log('段階的検索条件:', conditions);
    
    // Step 1: 全条件で検索（複数のbusiness_tagを試行）
    let results: any[] = [];
    for (const businessTag of conditions.businessTags) {
      const step1Results = await searchPersonasAdvanced({
        businessTag: businessTag,
        department: conditions.department,
        sizeBand: conditions.sizeBand,
        symptoms: conditions.symptoms,
        limit: 50
      });
      results = results.concat(step1Results);
      if (results.length > 0) break; // 結果が見つかったら終了
    }
    console.log(`Step 1 (全条件): ${results.length}件`);
    
    // Step 2: 商材 + 部署で検索（規模帯を緩和）
    if (results.length === 0) {
      for (const businessTag of conditions.businessTags) {
        const step2Results = await searchPersonasAdvanced({
          businessTag: businessTag,
          department: conditions.department,
          symptoms: conditions.symptoms,
          limit: 50
        });
        results = results.concat(step2Results);
        if (results.length > 0) break;
      }
      console.log(`Step 2 (商材+部署): ${results.length}件`);
    }
    
    // Step 3: 商材のみで検索
    if (results.length === 0) {
      for (const businessTag of conditions.businessTags) {
        const step3Results = await searchPersonasAdvanced({
          businessTag: businessTag,
          symptoms: conditions.symptoms,
          limit: 50
        });
        results = results.concat(step3Results);
        if (results.length > 0) break;
      }
      console.log(`Step 3 (商材のみ): ${results.length}件`);
    }
    
    // Step 4: 症状のみで検索
    if (results.length === 0 && conditions.symptoms.length > 0) {
      results = await searchPersonasAdvanced({
        symptoms: conditions.symptoms,
        limit: 50
      });
      console.log(`Step 4 (症状のみ): ${results.length}件`);
    }
    
    // Step 5: 推論されたターゲット組織の条件で検索
    if (results.length === 0 && conditions.targetOrganizations && conditions.targetOrganizations.length > 0) {
      console.log('Step 5: 推論されたターゲット組織の条件で検索');
      for (const targetOrg of conditions.targetOrganizations) {
        const targetResults = await searchPersonasAdvanced({
          businessTag: targetOrg.businessTag,
          department: targetOrg.department,
          sizeBand: targetOrg.sizeBand,
          symptoms: conditions.symptoms,
          limit: 50
        });
        
        if (targetResults.length > 0) {
          console.log(`Step 5 (${targetOrg.category}): ${targetResults.length}件`);
          results = results.concat(targetResults);
          break; // 最初に見つかったカテゴリで終了
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('段階的検索エラー:', error);
    return [];
  }
}
