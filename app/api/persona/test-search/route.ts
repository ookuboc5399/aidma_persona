import { NextRequest, NextResponse } from 'next/server';
import { searchPersonasBySymptom } from '@/lib/snowflake-persona';

export async function GET(request: NextRequest) {
  try {
    console.log('=== ペルソナ検索テスト開始 ===');
    
    // テスト用の検索キーワード
    const testKeywords = ['有効リスト不足', '営業', 'システム'];
    
    const results = [];
    
    for (const keyword of testKeywords) {
      console.log(`検索キーワード: ${keyword}`);
      try {
        const searchResults = await searchPersonasBySymptom(keyword, 10);
        results.push({
          keyword,
          count: searchResults.length,
          data: searchResults.slice(0, 3) // 最初の3件のみ
        });
        console.log(`${keyword}の検索結果: ${searchResults.length}件`);
      } catch (error) {
        console.error(`${keyword}の検索エラー:`, error);
        results.push({
          keyword,
          count: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    console.log('=== ペルソナ検索テスト終了 ===');
    
    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナ検索テストが完了しました'
    });
    
  } catch (error) {
    console.error('ペルソナ検索テストエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'ペルソナ検索テストに失敗しました'
    }, { status: 500 });
  }
}
