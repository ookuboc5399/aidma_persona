import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== Adding REGION and PREFECTURE columns to Snowflake COMPANIES table ===');

    // カラム追加のSQL
    const addColumnsSQL = `
      ALTER TABLE COMPANIES 
      ADD COLUMN REGION VARCHAR(100),
      ADD COLUMN PREFECTURE VARCHAR(100);
    `;

    console.log('Executing SQL:', addColumnsSQL);
    
    // カラムを追加
    await snowflakeClient.executeQuery(addColumnsSQL);
    console.log('✅ Columns added successfully');

    // コメントを追加
    const addCommentsSQL = `
      COMMENT ON COLUMN COMPANIES.REGION IS '地域（関東、関西など）';
      COMMENT ON COLUMN COMPANIES.PREFECTURE IS '都道府県';
    `;

    console.log('Adding column comments...');
    await snowflakeClient.executeQuery(addCommentsSQL);
    console.log('✅ Column comments added successfully');

    // テーブル構造を確認
    const describeSQL = `
      DESCRIBE TABLE COMPANIES;
    `;

    console.log('Checking table structure...');
    const tableStructure = await snowflakeClient.executeQuery(describeSQL);
    console.log('Table structure:', tableStructure);

    return NextResponse.json({
      success: true,
      message: 'REGION and PREFECTURE columns added successfully to COMPANIES table',
      tableStructure: tableStructure
    });

  } catch (error: unknown) {
    console.error('Error adding columns to Snowflake:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to add columns: ${errorMessage}` },
      { status: 500 }
    );
  }
}
