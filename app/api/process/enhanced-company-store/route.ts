import { NextRequest, NextResponse } from 'next/server';
import { extractCompanyNameDetailed } from '../../../../lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { 
      companyName, 
      conversationData, 
      sourceUrl, 
      originalCompanyName,
      confidence,
      meetingType,
      isExtractedFromConversation 
    } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== 強化版企業情報保存処理開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`元の企業名: ${originalCompanyName}`);
    console.log(`抽出信頼度: ${confidence || 'N/A'}`);
    console.log(`会議タイプ: ${meetingType || 'N/A'}`);
    console.log(`会話データ長: ${conversationData.length}`);
    console.log(`会話データから抽出: ${isExtractedFromConversation ? 'Yes' : 'No'}`);

    // Step 1: 企業名を正規化
    const extractedCompanyName = isExtractedFromConversation 
      ? companyName // 既に抽出済みの場合はそのまま使用
      : (originalCompanyName ? extractCompanyNameDetailed(originalCompanyName).companyName : companyName);
    
    console.log(`最終企業名: ${extractedCompanyName}`);

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
        challenges: extractResult.challenges,
        // 追加のメタデータ
        metadata: {
          originalTitle: originalCompanyName,
          extractionConfidence: confidence,
          meetingType,
          isExtractedFromConversation,
          conversationLength: conversationData.length
        }
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
          originalCompanyName,
          extractedChallenges: extractResult.extractedChallenges,
          challenges: extractResult.challenges,
          companyInfo: extractResult.companyInfo,
          metadata: {
            confidence,
            meetingType,
            isExtractedFromConversation,
            duplicateHandled: true
          },
          dataSource: 'snowflake',
          processingInfo: {
            steps: [
              '企業情報と課題の統合抽出',
              '企業名重複を検出（既存データを保持）'
            ],
            message: '企業情報の保存処理が完了しました（既存データを保持）'
          }
        });
      }
      
      throw new Error(`Snowflake保存失敗: ${error.error}`);
    }

    await storeResponse.json();
    console.log('✅ 企業情報と課題をSnowflakeに保存完了');

    return NextResponse.json({
      success: true,
      companyName: extractedCompanyName,
      originalCompanyName,
      extractedChallenges: extractResult.extractedChallenges,
      challenges: extractResult.challenges,
      companyInfo: extractResult.companyInfo,
      metadata: {
        confidence,
        meetingType,
        isExtractedFromConversation
      },
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
    console.error('強化版企業情報保存処理エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `強化版企業情報保存処理失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
