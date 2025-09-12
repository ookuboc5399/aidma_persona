import { NextRequest, NextResponse } from 'next/server';
import { getPersonaTables, getTableStructure, getAllPersonas } from '../../../../lib/snowflake-persona';

export async function GET(req: NextRequest) {
  try {
    console.log('=== ペルソナデータベースデバッグ情報取得 ===');
    
    const results: any = {
      timestamp: new Date().toISOString(),
      database: 'OUTBOUND_PATTERS',
      tables: [],
      tableStructures: {},
      sampleData: {},
      errors: []
    };

    // テーブル一覧を取得
    try {
      const tables = await getPersonaTables();
      results.tables = tables;
      console.log('テーブル一覧取得完了:', tables);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`テーブル一覧取得エラー: ${errorMessage}`);
      console.error('テーブル一覧取得エラー:', error);
    }

    // 各テーブルの構造を取得
    if (results.tables && results.tables.length > 0) {
      for (const table of results.tables) {
        try {
          const structure = await getTableStructure(table.TABLE_NAME);
          results.tableStructures[table.TABLE_NAME] = structure;
          console.log(`テーブル ${table.TABLE_NAME} の構造取得完了`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`テーブル ${table.TABLE_NAME} の構造取得エラー: ${errorMessage}`);
          results.tableStructures[table.TABLE_NAME] = { error: errorMessage };
          console.error(`テーブル ${table.TABLE_NAME} の構造取得エラー:`, error);
        }
      }
    }

    // サンプルデータを取得
    try {
      const sampleData = await getAllPersonas(10);
      results.sampleData = sampleData;
      console.log('サンプルデータ取得完了:', sampleData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`サンプルデータ取得エラー: ${errorMessage}`);
      results.sampleData = { error: errorMessage };
      console.error('サンプルデータ取得エラー:', error);
    }

    // 統計情報を追加
    results.statistics = {
      totalTables: results.tables?.length || 0,
      tablesWithSymptomColumn: results.tables?.filter((table: any) => 
        results.tableStructures[table.TABLE_NAME]?.some((col: any) => 
          col.name && col.name.toLowerCase().includes('symptom')
        )
      ).length || 0,
      totalErrors: results.errors.length,
      hasSampleData: results.sampleData && !results.sampleData.error && Array.isArray(results.sampleData) && results.sampleData.length > 0
    };

    console.log('=== ペルソナデータベースデバッグ情報取得完了 ===');

    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナデータベースデバッグ情報を取得しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナデータベースデバッグ情報取得エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナデータベースデバッグ情報取得失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}
