import { NextRequest, NextResponse } from 'next/server';
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
        const aiInferredConditions = await inferSearchConditions(target, companyName);
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
            description: 'AI推論による段階的検索結果',
            targetOrganizations: aiInferredConditions.targetOrganizations
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
async function inferSearchConditions(target: any, companyName: string): Promise<any> {
  // 業種から推論される商材・部署・規模帯
  const industry = target.industry_normalized;
  
  // 企業の強み・特徴からターゲット先を推論
  const targetInferences = inferTargetOrganizations(target);
  
  // 業種に基づく推論ロジック
  const businessTags = inferBusinessTag(industry);
  const inferredConditions = {
    businessTags: businessTags, // 複数のbusiness_tagを配列で返す
    businessTag: businessTags[0], // 最初のbusiness_tag（後方互換性のため）
    department: inferDepartment(industry),
    sizeBand: inferSizeBand(industry),
    symptoms: target.personas?.map((p: any) => p.persona_mapped || p.persona_statement_raw) || [],
    targetOrganizations: targetInferences
  };
  
  return inferredConditions;
}

/**
 * データベースのbusiness_tagマッピング（実際のデータベースに基づく）
 */
const DATABASE_BUSINESS_TAGS = {
  // 福祉・介護関連
  '福祉・介護': [
    '介護サービス計画(ケアプラン)作成', '介護タクシー運行', '介護リフォーム(バリアフリーリフォーム)',
    '介護予防', '介護事業コンサルティング', '介護人材派遣', '介護人材紹介', '介護人材育成',
    '介護保険販売', '介護士派遣', '介護士紹介', '介護支援ソフトウェア開発', '介護施設運営',
    '介護施設開業支援', '介護用品レンタル・リース', '介護用品卸売', '介護用品製造',
    '介護用品販売', '介護移送サービス提供', 'サービス付き高齢者住宅運営',
    '障害者支援施設運営', '障害者就労支援', '障害者雇用支援', '社会福祉法人運営'
  ],
  
  // 医療・福祉関連
  '医療・福祉': [
    'クリニック(診療所)運営', '病院運営', '医療機器卸売', '医療機器販売', '医療機器製造',
    '医療機器レンタル・リース', '医療ソフトウェア開発', '医療情報システム開発',
    '医療コンサルティング', '医療人材派遣', '医療人材紹介', '医療保険販売',
    '医療施設運営', '医療施設開業支援', '医療移送サービス提供', '在宅医療サービス提供',
    '訪問看護サービス提供', '訪問介護サービス提供', 'デイサービス運営', 'デイケア運営'
  ],
  
  // 不動産関連
  '不動産': [
    'アパート賃貸', 'エコ住宅建設', 'オフィス(事務所)賃貸', 'テナント賃貸', 'ビル賃貸',
    'マンション賃貸', '不動産任意売却', '不動産再生', '不動産売却', '不動産情報サイト運営',
    '不動産担保ローン販売', '不動産査定', '不動産業向けソフトウェア開発', '不動産登記手続代行',
    '不動産競売代行', '不動産買取', '不動産運用', '不動産鑑定', '中古不動産販売',
    '賃貸管理', '賃貸仲介', '売買仲介', '不動産投資', '不動産開発'
  ],
  
  // IT・システム関連
  'IT・システム': [
    '3次元測量システム開発', 'ARアプリ開発', 'CAD・CAM・CAE用ソフトウェア開発',
    'DTP用ソフトウェア開発', 'ECサイト管理システム運営', 'ERPシステム開発',
    'FAシステム開発', 'IP監視カメラシステム販売', 'IT資格取得支援', 'MRアプリ開発',
    'システム開発', 'ソフトウェア開発', 'Webサイト制作', 'Webアプリケーション開発',
    'モバイルアプリ開発', 'クラウドサービス提供', 'ITコンサルティング', 'IT人材派遣',
    'IT人材紹介', 'IT研修', 'IT資格取得支援', 'IT資格取得支援', 'IT資格取得支援'
  ],
  
  // 製造業関連
  '製造業': [
    '3Dプリンター製造', '3Dプリンター販売', '3Dプリンター卸売', '3D印刷', 'ATM製造',
    'AV機器製造', 'AV機器販売', 'AV機器卸売', 'CAD・CAM・CAE用ソフトウェア製造',
    'DVDレコーダー製造', 'DVD製造', 'DVD販売', 'DVD卸売', 'FAシステム製造',
    'IP監視カメラシステム製造', '自動車部品製造', '自動車部品販売', '自動車部品卸売',
    '製造業', '製造', '工場', '生産', '加工', '組立', '検査', '品質管理'
  ],
  
  // 小売・流通関連
  '小売・流通': [
    '3Dプリンター販売', '3Dプリンター卸売', 'AED販売', 'AED卸売', 'AV機器販売',
    'AV機器卸売', 'CAD・CAM・CAE用ソフトウェア販売', 'CAD・CAM・CAE用ソフトウェア卸売',
    'DVD販売', 'DVD卸売', 'DTP用ソフトウェア販売', 'DTP用ソフトウェア卸売',
    'ERP用ソフトウェア販売', 'ERP用ソフトウェア卸売', 'FAシステム販売', 'FAシステム卸売',
    '小売業', '卸売業', '流通', '販売', 'EC・通販', 'オンライン販売', 'ECサイト運営'
  ],
  
  // 金融・保険関連
  '金融・保険': [
    'ETCカード発行', '介護保険販売', '医療保険販売', '不動産担保ローン販売',
    '金融', '保険', '銀行', '証券', '投資', 'ローン', 'クレジット', '決済',
    '金融コンサルティング', '保険コンサルティング', '資産運用', '投資信託',
    '生命保険', '損害保険', '自動車保険', '火災保険', '地震保険'
  ],
  
  // 教育・研修関連
  '教育・研修': [
    'CADスクール運営', 'IT資格取得支援', '教育', '研修', '学校', '学習', '教育サービス',
    '資格取得支援', '職業訓練', '人材育成', 'スキルアップ', '専門学校運営',
    '学習塾運営', '予備校運営', '語学学校運営', 'パソコン教室運営'
  ],
  
  // その他
  'その他': [
    'その他', 'その他サービス', 'コンサルティング', '人材派遣', '人材紹介',
    'BPO関連サービス提供', 'DM制作', 'DM発送代行', 'DNA検査', 'ETC車載器取付',
    'CG制作', 'CGパース製造', 'CD・レコードショップ運営', 'CD・レコード制作',
    'CD・レコード販売', 'CD・レコード買取', 'CDジャケット印刷'
  ]
};

/**
 * 業種から商材を推論（実際のデータベースのbusiness_tagに基づく）
 */
function inferBusinessTag(industry: string): string[] {
  const industryMapping: Record<string, string[]> = {
    '支援機関': ['介護施設運営', '障害者支援施設運営', '社会福祉法人運営', '福祉システム開発'],
    '製造業': ['3Dプリンター製造', 'AV機器製造', 'DVDレコーダー製造', '自動車部品製造'],
    'IT・システム開発': ['システム開発', 'ソフトウェア開発', 'Webアプリケーション開発', 'モバイルアプリ開発'],
    '小売業': ['3Dプリンター販売', 'AV機器販売', 'DVD販売', 'ECサイト運営'],
    '卸売業': ['3Dプリンター卸売', 'AV機器卸売', 'DVD卸売'],
    '建設業': ['エコ住宅建設', '福祉施設建設', '福祉施設設計'],
    '医療・福祉': ['クリニック(診療所)運営', '病院運営', '医療機器販売', '介護施設運営'],
    '教育': ['CADスクール運営', 'IT資格取得支援', '学習塾運営', '専門学校運営'],
    '金融': ['ETCカード発行', '介護保険販売', '医療保険販売', '不動産担保ローン販売'],
    '不動産': ['不動産任意売却', '不動産情報サイト運営', 'アパート賃貸', 'マンション賃貸'],
    '福祉': ['介護施設運営', '障害者支援施設運営', '福祉システム開発', '福祉人材派遣'],
    '介護': ['介護施設運営', '介護サービス計画(ケアプラン)作成', '介護人材派遣', '介護用品販売'],
    '障害者支援': ['障害者支援施設運営', '障害者就労支援', '障害者雇用支援', '介護施設運営'],
    '社会福祉': ['社会福祉法人運営', '介護施設運営', '福祉システム開発']
  };
  
  return industryMapping[industry] || ['その他'];
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
