import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function GET(req: NextRequest) {
  try {
    console.log('=== Snowflakeテーブル情報取得開始 ===');

    // COMPANIESテーブルの構造を取得
    const describeQuery = `DESCRIBE TABLE COMPANIES`;
    const tableStructure = await snowflakeClient.executeQuery(describeQuery);
    
    console.log('テーブル構造:', tableStructure);

    // 現在のレコード数を取得
    const countQuery = `SELECT COUNT(*) as TOTAL_COUNT FROM COMPANIES`;
    const countResult = await snowflakeClient.executeQuery(countQuery);
    const totalCount = countResult[0]?.TOTAL_COUNT || 0;

    // サンプルレコードを取得
    const sampleQuery = `SELECT * FROM COMPANIES LIMIT 3`;
    const sampleData = await snowflakeClient.executeQuery(sampleQuery);

    console.log(`現在の企業数: ${totalCount}`);
    console.log('サンプルデータ:', sampleData);

    return NextResponse.json({
      success: true,
      tableStructure,
      totalCount,
      sampleData,
      message: 'COMPANIESテーブル情報を取得しました'
    });

  } catch (error: unknown) {
    console.error('Snowflakeテーブル情報取得エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `テーブル情報取得失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
