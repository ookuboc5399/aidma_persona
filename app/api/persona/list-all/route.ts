import { NextRequest, NextResponse } from 'next/server';
import { getAllPersonas } from '@/lib/snowflake-persona';

export async function GET(request: NextRequest) {
  try {
    console.log('=== 全ペルソナデータ取得開始 ===');
    
    // 全ペルソナデータを取得（制限なし）
    const allPersonas = await getAllPersonas(1000);
    
    // BUSINESS_TAGの一覧を取得
    const businessTags = [...new Set(allPersonas.map(p => p.BUSINESS_TAG).filter(Boolean))];
    
    // 部署の一覧を取得
    const departments = [...new Set(allPersonas.map(p => p.DEPARTMENT).filter(Boolean))];
    
    // 規模帯の一覧を取得
    const sizeBands = [...new Set(allPersonas.map(p => p.SIZE_BAND).filter(Boolean))];
    
    // 課題名の一覧を取得
    const challengeNames = [...new Set(allPersonas.map(p => p.CHALLENGE_NAME).filter(Boolean))];
    
    console.log(`取得したペルソナデータ: ${allPersonas.length}件`);
    console.log(`BUSINESS_TAG種類: ${businessTags.length}種類`);
    console.log(`部署種類: ${departments.length}種類`);
    console.log(`規模帯種類: ${sizeBands.length}種類`);
    console.log(`課題種類: ${challengeNames.length}種類`);
    
    return NextResponse.json({
      success: true,
      results: {
        totalCount: allPersonas.length,
        businessTags: businessTags.sort(),
        departments: departments.sort(),
        sizeBands: sizeBands.sort(),
        challengeNames: challengeNames.sort(),
        sampleData: allPersonas.slice(0, 10), // 最初の10件をサンプルとして返す
        allData: allPersonas // 全データも返す
      },
      message: '全ペルソナデータを取得しました'
    });
    
  } catch (error) {
    console.error('全ペルソナデータ取得エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '全ペルソナデータの取得に失敗しました'
    }, { status: 500 });
  }
}
