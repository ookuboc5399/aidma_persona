import { NextRequest, NextResponse } from 'next/server';
import { extractSpeakers, filterConversationData, DEFAULT_EXCLUDE_SPEAKERS, FilterOptions } from '../../../../lib/conversation-filter';

export async function POST(req: NextRequest) {
  try {
    const { 
      companyName, 
      conversationData, 
      sourceUrl, 
      originalCompanyName,
      serviceName,
      extractCompanyInfo = true 
    } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== ペルソナ強化版処理開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`元の企業名: ${originalCompanyName}`);
    console.log(`サービス名: ${serviceName || '未指定'}`);
    console.log(`会話データ長: ${conversationData.length}`);

    const results: any = {
      companyName,
      sourceUrl,
      steps: [],
      personaResults: null,
      targetSearchResults: null
    };

    // Step 1: 話者フィルター処理
    console.log('\n=== Step 1: 話者フィルター処理 ===');
    const originalSpeakers = extractSpeakers(conversationData);
    console.log(`会話参加者: ${originalSpeakers.join(', ')}`);

    const allExcludeSpeakers = [...DEFAULT_EXCLUDE_SPEAKERS];
    const filterOptions: FilterOptions = {
      excludeSpeakers: allExcludeSpeakers,
      includeSpeakers: [],
      excludeKeywords: []
    };
    
    const filterResult = filterConversationData(conversationData, filterOptions);
    console.log(`話者フィルター適用:`);
    console.log(`- 除外された話者: ${filterResult.excludedSpeakers.join(', ') || 'なし'}`);
    console.log(`- 残った話者: ${filterResult.includedSpeakers.join(', ')}`);
    console.log(`- 除外された発言: ${filterResult.excludedLines}件`);
    console.log(`- 残った発言: ${filterResult.includedLines}件`);

    const processedConversationData = filterResult.filteredData;

    // Step 2: 企業情報抽出（オプション）
    if (extractCompanyInfo) {
      console.log('\n=== Step 2: 企業情報抽出 ===');
      try {
        const companyExtractionResponse = await fetch(`${req.nextUrl.origin}/api/companies/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName,
            conversationData: processedConversationData,
            sourceUrl,
          }),
        });

        if (companyExtractionResponse.ok) {
          const companyResult = await companyExtractionResponse.json();
          results.companyExtraction = companyResult;
          results.steps.push({
            step: 'company_extraction',
            status: 'success',
            message: companyResult.message,
            model_used: companyResult.model_used
          });
          console.log('✅ 企業情報抽出完了');
        } else {
          const error = await companyExtractionResponse.json();
          results.steps.push({
            step: 'company_extraction',
            status: 'error',
            message: error.error
          });
          console.warn('⚠️ 企業情報抽出失敗、他のステップを継続');
        }
      } catch (error) {
        results.steps.push({
          step: 'company_extraction',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('⚠️ 企業情報抽出でエラー、他のステップを継続');
      }
    }

    // Step 3: 課題抽出（既存の処理）
    console.log('\n=== Step 3: 課題抽出 ===');
    try {
      const challengeResponse = await fetch(`${req.nextUrl.origin}/api/challenges/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          conversationData: processedConversationData,
          sourceUrl,
        }),
        signal: AbortSignal.timeout(15 * 60 * 1000), // 15分
      });

      if (challengeResponse.ok) {
        const challengeResult = await challengeResponse.json();
        results.challengeExtraction = challengeResult;
        results.steps.push({
          step: 'challenge_extraction',
          status: 'success',
          message: '課題抽出が完了しました',
          challengeId: challengeResult.challengeId
        });
        console.log('✅ 課題抽出完了');
      } else {
        const error = await challengeResponse.json();
        results.steps.push({
          step: 'challenge_extraction',
          status: 'error',
          message: error.error
        });
        console.warn('⚠️ 課題抽出失敗');
      }
    } catch (error) {
      results.steps.push({
        step: 'challenge_extraction',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('⚠️ 課題抽出でエラー');
    }

    // Step 4: ペルソナ抽出（新機能）
    console.log('\n=== Step 4: ペルソナ抽出 ===');
    try {
      const personaResponse = await fetch(`${req.nextUrl.origin}/api/persona/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          conversationData: processedConversationData,
          serviceName: serviceName || results.companyExtraction?.companyInfo?.business_description || '未指定'
        }),
      });

      if (personaResponse.ok) {
        const personaResult = await personaResponse.json();
        results.personaResults = personaResult;
        results.steps.push({
          step: 'persona_extraction',
          status: 'success',
          message: 'ペルソナ抽出が完了しました',
          extractedPersonas: personaResult.extractedPersonas
        });
        console.log('✅ ペルソナ抽出完了');
        console.log('抽出されたペルソナ:', JSON.stringify(personaResult.extractedPersonas, null, 2));
      } else {
        const error = await personaResponse.json();
        results.steps.push({
          step: 'persona_extraction',
          status: 'error',
          message: error.error
        });
        console.warn('⚠️ ペルソナ抽出失敗');
      }
    } catch (error) {
      results.steps.push({
        step: 'persona_extraction',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('⚠️ ペルソナ抽出でエラー');
    }

    // Step 5: ペルソナベースターゲット検索（新機能）
    if (results.personaResults?.extractedPersonas) {
      console.log('\n=== Step 5: ペルソナベースターゲット検索 ===');
      try {
        const targetSearchResponse = await fetch(`${req.nextUrl.origin}/api/persona/search-targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            extractedPersonas: results.personaResults.extractedPersonas,
            companyName
          }),
        });

        if (targetSearchResponse.ok) {
          const targetSearchResult = await targetSearchResponse.json();
          results.targetSearchResults = targetSearchResult;
          results.steps.push({
            step: 'target_search',
            status: 'success',
            message: 'ペルソナベースターゲット検索が完了しました',
            totalMatches: targetSearchResult.results?.summary?.totalMatches || 0
          });
          console.log('✅ ペルソナベースターゲット検索完了');
          console.log(`総マッチ数: ${targetSearchResult.results?.summary?.totalMatches || 0}件`);
        } else {
          const error = await targetSearchResponse.json();
          results.steps.push({
            step: 'target_search',
            status: 'error',
            message: error.error
          });
          console.warn('⚠️ ペルソナベースターゲット検索失敗');
        }
      } catch (error) {
        results.steps.push({
          step: 'target_search',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('⚠️ ペルソナベースターゲット検索でエラー');
      }
    }

    // Step 5.5: ターゲット提案書生成（新機能）
    if (results.personaResults?.extractedPersonas && results.targetSearchResults?.results) {
      console.log('\n=== Step 5.5: ターゲット提案書生成 ===');
      try {
        const proposalResponse = await fetch(`${req.nextUrl.origin}/api/persona/generate-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            extractedPersonas: results.personaResults.extractedPersonas,
            targetSearchResults: results.targetSearchResults.results,
            companyName,
            serviceName: serviceName || results.companyExtraction?.companyInfo?.business_description || '未指定',
            companyInfo: results.companyExtraction?.companyInfo || null
          }),
        });

        if (proposalResponse.ok) {
          const proposalResult = await proposalResponse.json();
          results.proposalResults = proposalResult;
          results.steps.push({
            step: 'proposal_generation',
            status: 'success',
            message: 'ターゲット提案書の生成が完了しました'
          });
          console.log('✅ ターゲット提案書生成完了');
        } else {
          const error = await proposalResponse.json();
          results.steps.push({
            step: 'proposal_generation',
            status: 'error',
            message: error.error
          });
          console.warn('⚠️ ターゲット提案書生成失敗');
        }
      } catch (error) {
        results.steps.push({
          step: 'proposal_generation',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('⚠️ ターゲット提案書生成でエラー');
      }
    }

    // Step 6: Snowflakeデータ保存
    console.log('\n=== Step 6: Snowflakeデータ保存 ===');
    try {
      const snowflakeStoreResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          sourceUrl,
          challenges: results.challengeExtraction,
          companyInfo: results.companyExtraction?.companyInfo
        }),
      });

      if (snowflakeStoreResponse.ok) {
        const storeResult = await snowflakeStoreResponse.json();
        results.snowflakeStore = storeResult;
        results.steps.push({
          step: 'snowflake_store',
          status: 'success',
          message: 'Snowflakeデータ保存が完了しました'
        });
        console.log('✅ Snowflakeデータ保存完了');
      } else {
        const error = await snowflakeStoreResponse.json();
        results.steps.push({
          step: 'snowflake_store',
          status: 'error',
          message: error.error
        });
        console.warn('⚠️ Snowflakeデータ保存失敗');
      }
    } catch (error) {
      results.steps.push({
        step: 'snowflake_store',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('⚠️ Snowflakeデータ保存でエラー');
    }

    console.log('\n=== ペルソナ強化版処理完了 ===');
    console.log(`処理ステップ数: ${results.steps.length}`);
    console.log(`成功ステップ数: ${results.steps.filter(s => s.status === 'success').length}`);

    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナ強化版処理が完了しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナ強化版処理エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナ強化版処理失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}
