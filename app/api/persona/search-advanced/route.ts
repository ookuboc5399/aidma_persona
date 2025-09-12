import { NextRequest, NextResponse } from 'next/server';
import { searchPersonasAdvanced } from '@/lib/snowflake-persona';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessTag, department, sizeBand, symptoms, limit = 100 } = body;
    
    console.log('=== 高度なペルソナ検索開始 ===');
    console.log('検索条件:', { businessTag, department, sizeBand, symptoms, limit });
    
    // 高度な検索を実行
    const results = await searchPersonasAdvanced({
      businessTag,
      department,
      sizeBand,
      symptoms: Array.isArray(symptoms) ? symptoms : [symptoms].filter(Boolean),
      limit
    });
    
    // 結果の統計情報を計算
    const businessTagStats = results.reduce((acc: any, item: any) => {
      const tag = item.BUSINESS_TAG || '未分類';
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});
    
    const departmentStats = results.reduce((acc: any, item: any) => {
      const dept = item.DEPARTMENT || '未分類';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});
    
    const sizeBandStats = results.reduce((acc: any, item: any) => {
      const size = item.SIZE_BAND || '未分類';
      acc[size] = (acc[size] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`検索完了: ${results.length}件の結果`);
    console.log('=== 高度なペルソナ検索終了 ===');
    
    return NextResponse.json({
      success: true,
      results: {
        data: results,
        statistics: {
          totalMatches: results.length,
          businessTagDistribution: businessTagStats,
          departmentDistribution: departmentStats,
          sizeBandDistribution: sizeBandStats
        },
        searchCriteria: {
          businessTag,
          department,
          sizeBand,
          symptoms,
          limit
        }
      },
      message: '高度なペルソナ検索が完了しました'
    });
    
  } catch (error) {
    console.error('高度なペルソナ検索エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '高度なペルソナ検索に失敗しました'
    }, { status: 500 });
  }
}
