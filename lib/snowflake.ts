import snowflake from 'snowflake-sdk';

// Snowflake接続設定
const snowflakeConfig = {
  account: process.env.SNOWFLAKE_ACCOUNT || 'QOSKOKF-HY22175',
  username: process.env.SNOWFLAKE_USER || 'MASAKI',
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'SNOWFLAKE_LEARNING_WH',
  database: process.env.SNOWFLAKE_DATABASE || 'db',
  schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
  role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
};

// 接続プールを管理するクラス
class SnowflakeClient {
  private connection: any = null;

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection(snowflakeConfig);
      
      this.connection.connect((err: any, conn: any) => {
        if (err) {
          console.error('Snowflake connection error:', err);
          reject(err);
        } else {
          console.log('Successfully connected to Snowflake');
          resolve();
        }
      });
    });
  }

  async executeQuery(sqlText: string, binds: any[] = []): Promise<any[]> {
    await this.connect();

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        binds,
        complete: (err: any, stmt: any, rows: any[]) => {
          if (err) {
            console.error('Snowflake query error:', err);
            reject(err);
          } else {
            // UPDATE文などの場合、rowsはundefinedになることがある
            resolve(rows || []);
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      return new Promise((resolve) => {
        this.connection.destroy((err: any) => {
          if (err) {
            console.error('Snowflake disconnect error:', err);
          }
          this.connection = null;
          resolve();
        });
      });
    }
  }
}

// シングルトンインスタンス
const snowflakeClient = new SnowflakeClient();

// 企業データ検索関数
export async function searchCompaniesInSnowflake(searchCriteria: {
  keywords?: string[];
  industry?: string;
  region?: string;
  tags?: string[];
  limit?: number;
}): Promise<any[]> {
  const { keywords = [], industry, region, limit = 50 } = searchCriteria;

  // 動的なWHERE句を構築
  const whereConditions: string[] = [];
  const binds: any[] = [];
  
  if (keywords.length > 0) {
    const keywordConditions = keywords.map(keyword => {
      const upperKeyword = `%${keyword.toUpperCase()}%`;
      binds.push(upperKeyword, upperKeyword);
      return `(UPPER(COMPANY_NAME) LIKE ? OR UPPER(BUSINESS_DESCRIPTION) LIKE ?)`;
    });
    whereConditions.push(`(${keywordConditions.join(' OR ')})`);
  }

  if (industry) {
    whereConditions.push(`UPPER(INDUSTRY) LIKE ?`);
    binds.push(`%${industry.toUpperCase()}%`);
  }

  if (region) {
    whereConditions.push(`UPPER(REGION) LIKE ?`);
    binds.push(`%${region.toUpperCase()}%`);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  binds.push(limit);

  // CONSULTANT_NAME列が存在するかチェックしてからクエリを構築
  const consultantNameExists = await checkConsultantNameColumnExists();
  const consultantNameColumn = consultantNameExists ? ', CONSULTANT_NAME' : '';

  const query = `
    SELECT 
      COMPANY_ID,
      COMPANY_NAME,
      INDUSTRY,
      BUSINESS_DESCRIPTION,
      REGION,
      PREFECTURE,
      EMPLOYEE_COUNT,
      INCORPORATION_DATE,
      OFFICIAL_WEBSITE${consultantNameColumn}
    FROM COMPANIES 
    ${whereClause}
    ORDER BY EMPLOYEE_COUNT DESC
    LIMIT ?
  `;

  try {
    const results = await snowflakeClient.executeQuery(query, binds);
    return results;
  } catch (error) {
    console.error('Error searching companies in Snowflake:', error);
    throw error;
  }
}

// 課題に基づくマッチング検索
export async function findSolutionCompanies(challengeKeywords: string[]): Promise<any[]> {
  console.log('=== findSolutionCompanies 開始 ===');
  console.log('入力課題キーワード:', challengeKeywords);
  
  // 課題キーワードに基づいて解決企業を検索
  const solutionKeywords = [
    ...challengeKeywords,
    'ソリューション', '解決', 'コンサルティング', 'サービス',
    'システム', 'AI', 'DX', '自動化', '効率化'
  ];
  
  console.log('検索用キーワード:', solutionKeywords);

  // まず全企業数を確認
  try {
    const totalQuery = `SELECT COUNT(*) as TOTAL_COUNT FROM COMPANIES`;
    const totalResult = await snowflakeClient.executeQuery(totalQuery);
    console.log(`データベース内の総企業数: ${totalResult[0]?.TOTAL_COUNT || 0}`);
  } catch (error) {
    console.error('総企業数の取得エラー:', error);
  }

  const results = await searchCompaniesInSnowflake({
    keywords: solutionKeywords,
    limit: 100
  });
  
  console.log(`検索結果: ${results.length}件の企業が見つかりました`);
  
  // 最初の3件の企業名をログ出力
  if (results.length > 0) {
    console.log('検索結果サンプル:');
    results.slice(0, 3).forEach((company, index) => {
      console.log(`${index + 1}. ${company.COMPANY_NAME}`);
    });
  } else {
    console.log('マッチする企業が見つかりませんでした');
  }
  
  console.log('=== findSolutionCompanies 終了 ===');
  
  return results;
}

// 企業の詳細情報を取得
export async function getCompanyDetails(companyId: string): Promise<any> {
  // CONSULTANT_NAME列が存在するかチェックしてからクエリを構築
  const consultantNameExists = await checkConsultantNameColumnExists();
  const consultantNameColumn = consultantNameExists ? ', CONSULTANT_NAME' : '';

  const query = `
    SELECT 
      COMPANY_ID,
      COMPANY_NAME,
      INDUSTRY,
      BUSINESS_DESCRIPTION,
      REGION,
      PREFECTURE,
      EMPLOYEE_COUNT,
      INCORPORATION_DATE,
      OFFICIAL_WEBSITE${consultantNameColumn}
    FROM COMPANIES 
    WHERE COMPANY_ID = ?
  `;

  try {
    const results = await snowflakeClient.executeQuery(query, [companyId]);
    return results[0] || null;
  } catch (error) {
    console.error('Error getting company details from Snowflake:', error);
    throw error;
  }
}

/**
 * CONSULTANT_NAME列が存在するかチェックする
 */
async function checkConsultantNameColumnExists(): Promise<boolean> {
  console.log(`🔍 checkConsultantNameColumnExists関数開始`);
  try {
    const checkQuery = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'COMPANIES' 
      AND COLUMN_NAME = 'CONSULTANT_NAME'
      AND TABLE_SCHEMA = UPPER(?)
    `;
    
    console.log(`🔄 列存在確認クエリ実行: ${checkQuery}`);
    console.log(`📊 スキーマパラメータ: "${snowflakeConfig.schema}"`);
    
    const result = await snowflakeClient.executeQuery(checkQuery, [snowflakeConfig.schema]);
    console.log(`📈 クエリ結果:`, result);
    console.log(`📊 結果件数: ${result.length}`);
    
    const exists = result.length > 0;
    console.log(`✅ 列の存在確認完了: ${exists ? '存在する' : '存在しない'}`);
    return exists;
  } catch (error) {
    console.warn('CONSULTANT_NAME列の確認中にエラーが発生しました:', error);
    console.warn(`エラーの詳細:`, error instanceof Error ? error.message : String(error));
    console.warn(`スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
    return false;
  }
}

/**
 * CONSULTANT_NAME列が存在するかチェックし、存在しない場合は追加する
 */
async function ensureConsultantNameColumn(): Promise<void> {
  console.log(`🔍 ensureConsultantNameColumn関数開始`);
  try {
    console.log(`🔍 CONSULTANT_NAME列の存在確認中...`);
    const exists = await checkConsultantNameColumnExists();
    console.log(`📊 列の存在確認結果: ${exists ? '存在する' : '存在しない'}`);
    
    if (!exists) {
      console.log(`🔧 CONSULTANT_NAME列が存在しないため、追加処理を実行します`);
      // 列が存在しない場合は追加
      const alterQuery = `ALTER TABLE COMPANIES ADD COLUMN CONSULTANT_NAME VARCHAR(1000)`;
      console.log(`🔄 ALTER TABLEクエリ実行: ${alterQuery}`);
      
      try {
        await snowflakeClient.executeQuery(alterQuery);
        console.log('✅ COMPANIESテーブルにCONSULTANT_NAME列を追加しました');
        
        // 追加後に再度確認
        const recheckExists = await checkConsultantNameColumnExists();
        console.log(`🔍 追加後の列存在確認: ${recheckExists ? '存在する' : '存在しない'}`);
        
        if (!recheckExists) {
          console.error('❌ CONSULTANT_NAME列の追加に失敗した可能性があります');
        }
      } catch (alterError) {
        console.error('❌ ALTER TABLEクエリの実行中にエラーが発生しました:', alterError);
        console.error(`エラーの詳細:`, alterError instanceof Error ? alterError.message : String(alterError));
        // 列が既に存在する場合のエラーを無視
        const errorMessage = alterError instanceof Error ? alterError.message : String(alterError);
        if (!errorMessage.includes('already exists') && !errorMessage.includes('duplicate')) {
          throw alterError;
        } else {
          console.log('ℹ️ 列は既に存在するようです（エラーを無視します）');
        }
      }
    } else {
      console.log('✅ CONSULTANT_NAME列は既に存在します');
    }
  } catch (error) {
    console.error('❌ CONSULTANT_NAME列の確認・追加中にエラーが発生しました:', error);
    console.error(`エラーの詳細:`, error instanceof Error ? error.message : String(error));
    console.error(`スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

/**
 * 企業のコンサルタント情報を更新する
 * @param companyName 対象の企業名
 * @param consultantNames コンサルタント名のリスト
 */
export async function updateCompanyConsultant(companyName: string, consultantNames: string[]): Promise<void> {
  console.log(`🔧 updateCompanyConsultant関数開始`);
  console.log(`📋 入力パラメータ: companyName="${companyName}", consultantNames=[${consultantNames.join(', ')}]`);
  
  if (!companyName) {
    console.warn('企業名が指定されていないため、コンサルタント情報の更新をスキップします。');
    return;
  }
  if (consultantNames.length === 0) {
    console.log(`企業「${companyName}」の更新対象コンサルタントがいないため、処理をスキップします。`);
    return;
  }

  console.log(`🔍 CONSULTANT_NAME列の存在確認・追加処理開始`);
  // CONSULTANT_NAME列の存在確認・追加
  await ensureConsultantNameColumn();
  console.log(`✅ CONSULTANT_NAME列の確認完了`);
  
  // 最終的な列の存在確認
  const finalColumnExists = await checkConsultantNameColumnExists();
  if (!finalColumnExists) {
    console.error('❌ CONSULTANT_NAME列が存在しないため、更新処理をスキップします');
    return;
  }

  const consultantsString = consultantNames.join(', ');
  console.log(`📝 保存するコンサルタント文字列: "${consultantsString}"`);

  // まず、該当する企業が存在するか確認
  console.log(`🔍 企業「${companyName}」の存在確認中...`);
  const checkCompanyQuery = `SELECT COMPANY_NAME FROM COMPANIES WHERE COMPANY_NAME = ?`;
  const existingCompanies = await snowflakeClient.executeQuery(checkCompanyQuery, [companyName]);
  console.log(`📊 企業存在確認結果: ${existingCompanies.length}件見つかりました`);
  
  if (existingCompanies.length === 0) {
    console.warn(`⚠️ 企業「${companyName}」がCOMPANIESテーブルに見つかりません`);
    // 部分マッチで検索してみる
    const partialMatchQuery = `SELECT COMPANY_NAME FROM COMPANIES WHERE COMPANY_NAME LIKE ? LIMIT 5`;
    const partialMatches = await snowflakeClient.executeQuery(partialMatchQuery, [`%${companyName}%`]);
    console.log(`🔍 部分マッチ検索結果:`, partialMatches);
    
    if (partialMatches.length > 0) {
      console.log(`💡 類似する企業名が見つかりました。最初の企業名を使用します: ${partialMatches[0].COMPANY_NAME}`);
      companyName = partialMatches[0].COMPANY_NAME;
    } else {
      console.error(`❌ 企業「${companyName}」および類似する企業名が見つかりません`);
      return;
    }
  }

  const query = `
    UPDATE COMPANIES
    SET CONSULTANT_NAME = ?
    WHERE COMPANY_NAME = ?
  `;
  
  console.log(`🔄 SQLクエリ実行開始: ${query}`);
  console.log(`📊 バインドパラメータ: ["${consultantsString}", "${companyName}"]`);

  try {
    const result = await snowflakeClient.executeQuery(query, [consultantsString, companyName]);
    console.log(`✅ SQLクエリ実行完了`);
    console.log(`📈 クエリ結果:`, result);
    
    // 更新後の確認
    const verifyQuery = `SELECT COMPANY_NAME, CONSULTANT_NAME FROM COMPANIES WHERE COMPANY_NAME = ?`;
    const verifyResult = await snowflakeClient.executeQuery(verifyQuery, [companyName]);
    console.log(`🔍 更新後の確認結果:`, verifyResult);
    
    if (verifyResult.length > 0 && verifyResult[0].CONSULTANT_NAME === consultantsString) {
      console.log(`✅ 企業「${companyName}」のコンサルタント情報を正常に更新しました: ${consultantsString}`);
    } else {
      console.warn(`⚠️ 更新が正常に反映されていない可能性があります`);
      console.warn(`期待値: "${consultantsString}"`);
      console.warn(`実際の値: "${verifyResult[0]?.CONSULTANT_NAME || 'NULL'}"`);
    }
  } catch (error) {
    console.error(`❌ 企業「${companyName}」のコンサルタント情報更新中にエラーが発生しました:`, error);
    console.error(`エラーの詳細:`, error instanceof Error ? error.message : String(error));
    console.error(`スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

/**
 * 手動でCONSULTANT_NAME列を更新するテスト関数
 * @param companyName 対象の企業名
 * @param consultantNames コンサルタント名のリスト
 */
export async function testUpdateCompanyConsultant(companyName: string, consultantNames: string[]): Promise<void> {
  console.log(`🧪 テスト用CONSULTANT_NAME更新開始`);
  console.log(`📋 テストパラメータ: companyName="${companyName}", consultantNames=[${consultantNames.join(', ')}]`);
  
  try {
    // まず、該当する企業が存在するか確認
    console.log(`🔍 企業「${companyName}」の存在確認中...`);
    const checkCompanyQuery = `SELECT COMPANY_NAME FROM COMPANIES WHERE COMPANY_NAME = ?`;
    const existingCompanies = await snowflakeClient.executeQuery(checkCompanyQuery, [companyName]);
    console.log(`📊 企業存在確認結果: ${existingCompanies.length}件見つかりました`);
    
    if (existingCompanies.length === 0) {
      console.warn(`⚠️ 企業「${companyName}」がCOMPANIESテーブルに見つかりません`);
      // 部分マッチで検索してみる
      const partialMatchQuery = `SELECT COMPANY_NAME FROM COMPANIES WHERE COMPANY_NAME LIKE ? LIMIT 5`;
      const partialMatches = await snowflakeClient.executeQuery(partialMatchQuery, [`%${companyName}%`]);
      console.log(`🔍 部分マッチ検索結果:`, partialMatches);
      
      if (partialMatches.length > 0) {
        console.log(`💡 類似する企業名が見つかりました。最初の企業名を使用します: ${partialMatches[0].COMPANY_NAME}`);
        companyName = partialMatches[0].COMPANY_NAME;
      } else {
        console.error(`❌ 企業「${companyName}」および類似する企業名が見つかりません`);
        console.error(`❌ CONSULTANT_NAME列の更新をスキップします`);
        return;
      }
    }

    // CONSULTANT_NAME列の存在確認・追加
    await ensureConsultantNameColumn();

    const consultantsString = consultantNames.join(', ');
    console.log(`📝 保存するコンサルタント文字列: "${consultantsString}"`);

    const query = `
      UPDATE COMPANIES
      SET CONSULTANT_NAME = ?
      WHERE COMPANY_NAME = ?
    `;
    
    console.log(`🔄 SQLクエリ実行開始: ${query}`);
    console.log(`📊 バインドパラメータ: ["${consultantsString}", "${companyName}"]`);

    const result = await snowflakeClient.executeQuery(query, [consultantsString, companyName]);
    console.log(`✅ SQLクエリ実行完了`);
    console.log(`📈 クエリ結果:`, result);
    
    // 更新後の確認
    const verifyQuery = `SELECT COMPANY_NAME, CONSULTANT_NAME FROM COMPANIES WHERE COMPANY_NAME = ?`;
    const verifyResult = await snowflakeClient.executeQuery(verifyQuery, [companyName]);
    console.log(`🔍 更新後の確認結果:`, verifyResult);
    
    if (verifyResult.length > 0 && verifyResult[0].CONSULTANT_NAME === consultantsString) {
      console.log(`✅ 企業「${companyName}」のコンサルタント情報を正常に更新しました: ${consultantsString}`);
    } else {
      console.warn(`⚠️ 更新が正常に反映されていない可能性があります`);
      console.warn(`期待値: "${consultantsString}"`);
      console.warn(`実際の値: "${verifyResult[0]?.CONSULTANT_NAME || 'NULL'}"`);
    }
  } catch (error) {
    console.error(`❌ テスト更新中にエラーが発生しました:`, error);
    console.error(`エラーの詳細:`, error instanceof Error ? error.message : String(error));
    console.error(`スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

export { snowflakeClient };
