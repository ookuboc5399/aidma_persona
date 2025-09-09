import { NextRequest, NextResponse } from 'next/server';
import { extractCompanyNameDetailed } from '../../../../lib/utils';
import { extractSpeakers, filterConversationData, DEFAULT_EXCLUDE_SPEAKERS, FilterOptions } from '../../../../lib/conversation-filter';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, originalCompanyName } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake DB 保存処理開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`元の企業名: ${originalCompanyName}`);
    console.log(`会話データ長: ${conversationData.length}`);

    // Step 1: 企業名を抽出（会議タイトルから）
    const extractedCompanyName = originalCompanyName ? extractCompanyNameDetailed(originalCompanyName).companyName : companyName;
    console.log(`抽出された企業名: ${extractedCompanyName}`);

    // Step 1.5: 話者フィルター処理
    console.log('\n=== Step 1.5: 話者フィルター処理 ===');
    const originalSpeakers = extractSpeakers(conversationData);
    console.log(`会話参加者: ${originalSpeakers.join(', ')}`);

    // デフォルトの除外話者リストを適用
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

    // 除外話者情報を一時保存（企業データ保存後に使用）
    const excludedSpeakers = filterResult.excludedSpeakers;
    console.log(`📝 除外話者情報を一時保存: [${excludedSpeakers.join(', ')}]`);
    console.log(`ℹ️ 企業データ保存後にCONSULTANT_NAME列を更新します`);

    // Step 2: 企業情報と課題の統合抽出
    console.log('\n=== Step 1: 企業情報と課題の統合抽出 ===');
    const extractResponse = await fetch(`${req.nextUrl.origin}/api/extract/company-and-challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extractedCompanyName,
        conversationData,
        sourceUrl
      }),
      signal: AbortSignal.timeout(15 * 60 * 1000), // 15分
    });

    if (!extractResponse.ok) {
      const error = await extractResponse.json();
      throw new Error(`統合抽出失敗: ${error.error}`);
    }

    const extractResult = await extractResponse.json();
    console.log('✅ 企業情報と課題の統合抽出完了');

    // Step 3: 企業情報と課題をSnowflakeに保存
    console.log('\n=== Step 2: 企業情報と課題をSnowflakeに保存 ===');
    const storeResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extractedCompanyName,
        sourceUrl,
        companyInfo: extractResult.companyInfo,
        challenges: extractResult.challenges
      }),
      signal: AbortSignal.timeout(2 * 60 * 1000), // 2分
    });

    if (!storeResponse.ok) {
      const error = await storeResponse.json();
      
      // 重複エラーの場合は成功として処理
      if (storeResponse.status === 409) {
        console.log(`⚠️ 企業名重複: ${error.message}`);
        console.log('既存データがあるため、保存処理を完了とします');
        
        return NextResponse.json({
          success: true,
          companyName: extractedCompanyName,
          extractedChallenges: extractResult.extractedChallenges,
          challenges: extractResult.challenges,
          companyInfo: extractResult.companyInfo,
          dataSource: 'snowflake',
          duplicateHandled: true,
          processingInfo: {
            steps: [
              '企業情報と課題の統合抽出',
              '企業名重複を検出（既存データあり）'
            ],
            message: '企業情報の保存処理が完了しました（既存データを保持）'
          }
        });
      }
      
      throw new Error(`Snowflake保存失敗: ${error.error}`);
    }

    await storeResponse.json();
    console.log('✅ 企業情報と課題をSnowflakeに保存完了');

    // Step 2.5: 企業データ保存後にCONSULTANT_NAME列を更新
    console.log('\n=== Step 2.5: CONSULTANT_NAME列の更新 ===');
    if (excludedSpeakers.length > 0) {
      console.log(`🔍 除外話者保存処理開始: ${excludedSpeakers.length}名の話者が除外されました`);
      console.log(`📝 保存対象の除外話者: [${excludedSpeakers.join(', ')}]`);
      console.log(`🏢 対象企業: ${extractedCompanyName}`);
      
      try {
        const { updateCompanyConsultant } = await import('@/lib/snowflake');
        console.log(`🔄 updateCompanyConsultant関数を呼び出し中...`);
        await updateCompanyConsultant(extractedCompanyName, excludedSpeakers);
        console.log(`✅ 企業「${extractedCompanyName}」の除外話者情報をSnowflakeに保存しました: ${excludedSpeakers.join(', ')}`);
      } catch (error) {
        console.error(`❌ 企業「${extractedCompanyName}」の除外話者情報保存中にエラーが発生しました:`, error);
        console.error(`エラーの詳細:`, error.message);
        console.error(`スタックトレース:`, error.stack);
        // エラーが発生しても処理は継続
      }
    } else {
      console.log(`ℹ️ 除外された話者がいないため、CONSULTANT_NAME列の更新をスキップします`);
    }

    return NextResponse.json({
      success: true,
      companyName: extractedCompanyName,
      extractedChallenges: extractResult.extractedChallenges,
      challenges: extractResult.challenges,
      companyInfo: extractResult.companyInfo,
      dataSource: 'snowflake',
      processingInfo: {
        steps: [
          '企業情報と課題の統合抽出',
          '企業情報と課題をSnowflakeに保存'
        ],
        message: '企業情報の保存処理が完了しました'
      }
    });

  } catch (error: unknown) {
    console.error('Snowflake DB 保存処理エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake DB 保存処理失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
