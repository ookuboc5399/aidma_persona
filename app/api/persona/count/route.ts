import { NextRequest, NextResponse } from 'next/server';
import { snowflakePersonaClient } from '@/lib/snowflake-persona';

export async function GET(request: NextRequest) {
  try {
    console.log('=== データベース規模確認開始 ===');
    
    // PATTERNSテーブルの総行数を取得
    const countQuery = `SELECT COUNT(*) as total_count FROM "PATTERNS"`;
    const countResult = await snowflakePersonaClient.executeQuery(countQuery);
    const totalCount = countResult[0]?.TOTAL_COUNT || 0;
    
    // BUSINESS_TAG別の件数
    const businessTagQuery = `
      SELECT BUSINESS_TAG, COUNT(*) as count 
      FROM "PATTERNS" 
      WHERE BUSINESS_TAG IS NOT NULL 
      GROUP BY BUSINESS_TAG 
      ORDER BY count DESC
    `;
    const businessTagResult = await snowflakePersonaClient.executeQuery(businessTagQuery);
    
    // DEPARTMENT別の件数
    const departmentQuery = `
      SELECT DEPARTMENT, COUNT(*) as count 
      FROM "PATTERNS" 
      WHERE DEPARTMENT IS NOT NULL 
      GROUP BY DEPARTMENT 
      ORDER BY count DESC
    `;
    const departmentResult = await snowflakePersonaClient.executeQuery(departmentQuery);
    
    // SIZE_BAND別の件数
    const sizeBandQuery = `
      SELECT SIZE_BAND, COUNT(*) as count 
      FROM "PATTERNS" 
      WHERE SIZE_BAND IS NOT NULL 
      GROUP BY SIZE_BAND 
      ORDER BY count DESC
    `;
    const sizeBandResult = await snowflakePersonaClient.executeQuery(sizeBandQuery);
    
    console.log(`総データ数: ${totalCount}件`);
    console.log(`BUSINESS_TAG種類: ${businessTagResult.length}種類`);
    console.log(`DEPARTMENT種類: ${departmentResult.length}種類`);
    console.log(`SIZE_BAND種類: ${sizeBandResult.length}種類`);
    
    return NextResponse.json({
      success: true,
      results: {
        totalCount,
        businessTagDistribution: businessTagResult,
        departmentDistribution: departmentResult,
        sizeBandDistribution: sizeBandResult,
        summary: {
          totalRecords: totalCount,
          uniqueBusinessTags: businessTagResult.length,
          uniqueDepartments: departmentResult.length,
          uniqueSizeBands: sizeBandResult.length
        }
      },
      message: 'データベース規模情報を取得しました'
    });
    
  } catch (error) {
    console.error('データベース規模確認エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'データベース規模の確認に失敗しました'
    }, { status: 500 });
  }
}
