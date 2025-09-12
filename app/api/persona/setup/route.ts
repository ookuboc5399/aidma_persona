import { NextRequest, NextResponse } from 'next/server';
import { createOutboundPatternsDatabase, createPatternsTable, getPersonaTables, getAllPersonas } from '../../../../lib/snowflake-persona';

export async function POST(req: NextRequest) {
  try {
    console.log('=== ペルソナデータベースセットアップ開始 ===');
    
    const results: any = {
      databaseCreated: false,
      tableCreated: false,
      tables: [],
      sampleData: null,
      errors: []
    };

    // Step 1: データベースを作成
    console.log('Step 1: データベース作成');
    try {
      const dbCreated = await createOutboundPatternsDatabase();
      results.databaseCreated = dbCreated;
      if (dbCreated) {
        console.log('✅ データベース作成成功');
      } else {
        results.errors.push('データベース作成に失敗しました');
        console.log('❌ データベース作成失敗');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`データベース作成エラー: ${errorMessage}`);
      console.error('データベース作成エラー:', error);
    }

    // Step 2: テーブルを作成
    if (results.databaseCreated) {
      console.log('Step 2: テーブル作成');
      try {
        const tableCreated = await createPatternsTable();
        results.tableCreated = tableCreated;
        if (tableCreated) {
          console.log('✅ テーブル作成成功');
        } else {
          results.errors.push('テーブル作成に失敗しました');
          console.log('❌ テーブル作成失敗');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`テーブル作成エラー: ${errorMessage}`);
        console.error('テーブル作成エラー:', error);
      }
    }

    // Step 3: テーブル一覧を取得
    if (results.tableCreated) {
      console.log('Step 3: テーブル一覧取得');
      try {
        const tables = await getPersonaTables();
        results.tables = tables;
        console.log('✅ テーブル一覧取得成功');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`テーブル一覧取得エラー: ${errorMessage}`);
        console.error('テーブル一覧取得エラー:', error);
      }
    }

    // Step 4: サンプルデータを取得
    if (results.tableCreated) {
      console.log('Step 4: サンプルデータ取得');
      try {
        const sampleData = await getAllPersonas(5);
        results.sampleData = sampleData;
        console.log('✅ サンプルデータ取得成功');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`サンプルデータ取得エラー: ${errorMessage}`);
        console.error('サンプルデータ取得エラー:', error);
      }
    }

    console.log('=== ペルソナデータベースセットアップ完了 ===');

    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナデータベースセットアップが完了しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナデータベースセットアップエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナデータベースセットアップ失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log('=== ペルソナデータベース状況確認 ===');
    
    const results: any = {
      tables: [],
      sampleData: null,
      errors: []
    };

    // テーブル一覧を取得
    try {
      const tables = await getPersonaTables();
      results.tables = tables;
      console.log('✅ テーブル一覧取得成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`テーブル一覧取得エラー: ${errorMessage}`);
      console.error('テーブル一覧取得エラー:', error);
    }

    // サンプルデータを取得
    try {
      const sampleData = await getAllPersonas(5);
      results.sampleData = sampleData;
      console.log('✅ サンプルデータ取得成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`サンプルデータ取得エラー: ${errorMessage}`);
      console.error('サンプルデータ取得エラー:', error);
    }

    console.log('=== ペルソナデータベース状況確認完了 ===');

    return NextResponse.json({
      success: true,
      results,
      message: 'ペルソナデータベース状況確認が完了しました'
    });

  } catch (error: unknown) {
    console.error('ペルソナデータベース状況確認エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: `ペルソナデータベース状況確認失敗: ${errorMessage}`,
        success: false
      },
      { status: 500 }
    );
  }
}
