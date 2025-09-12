import snowflake from 'snowflake-sdk';

// ペルソナ抽出用Snowflake接続設定
const snowflakePersonaConfig = {
  account: process.env.SNOWFLAKE_ACCOUNT || 'QOSKOKF-HY22175',
  username: process.env.SNOWFLAKE_USER || 'MASAKI',
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'SNOWFLAKE_LEARNING_WH',
  database: process.env.SNOWFLAKE_DATABASE2 || 'OUTBOUND_PATTERS',
  schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
  role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
};

// ペルソナ抽出用接続プールを管理するクラス
class SnowflakePersonaClient {
  private connection: any = null;

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection(snowflakePersonaConfig);
      
      this.connection.connect((err: any, conn: any) => {
        if (err) {
          console.error('Snowflake Persona connection error:', err);
          reject(err);
        } else {
          console.log('Successfully connected to Snowflake Persona database');
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
            console.error('Snowflake Persona query error:', err);
            reject(err);
          } else {
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
            console.error('Snowflake Persona disconnect error:', err);
          }
          this.connection = null;
          resolve();
        });
      });
    }
  }
}

// シングルトンインスタンス
const snowflakePersonaClient = new SnowflakePersonaClient();

/**
 * テーブル一覧を取得
 */
export async function getPersonaTables(): Promise<any[]> {
  try {
    const query = `
      SELECT TABLE_NAME, TABLE_TYPE, COMMENT
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = UPPER(?)
      ORDER BY TABLE_NAME
    `;
    
    const results = await snowflakePersonaClient.executeQuery(query, [snowflakePersonaConfig.schema]);
    return results;
  } catch (error) {
    console.error('Error getting persona tables:', error);
    throw error;
  }
}

/**
 * 指定されたテーブルの構造を取得
 */
export async function getTableStructure(tableName: string): Promise<any[]> {
  try {
    const query = `DESCRIBE TABLE ${tableName}`;
    const results = await snowflakePersonaClient.executeQuery(query);
    return results;
  } catch (error) {
    console.error(`Error getting table structure for ${tableName}:`, error);
    throw error;
  }
}

/**
 * symptom列を含むテーブルからペルソナデータを検索
 */
export async function searchPersonasBySymptom(symptoms: string | string[], limit: number = 100): Promise<any[]> {
  try {
    console.log('=== searchPersonasBySymptom 開始 ===');
    
    // symptomsを配列に統一
    const symptomArray = Array.isArray(symptoms) ? symptoms : [symptoms];
    console.log('検索対象症状:', symptomArray);
    
    // PATTERNSテーブルから直接検索（3M行対応の最適化クエリ）
    const whereConditions = symptomArray.map(symptom => {
      return `UPPER(SYMPTOM) LIKE UPPER('%${symptom.replace(/'/g, "''")}%')`;
    });
    
    // 段階的絞り込みでパフォーマンス向上
    const query = `
      SELECT 
        BUSINESS_TAG,
        DEPARTMENT,
        SIZE_BAND,
        CHALLENGE_NAME,
        SYMPTOM,
        RECOMMENDED_OUTBOUND_PLAY,
        PRIMARY_KPI
      FROM "PATTERNS"
      WHERE ${whereConditions.join(' OR ')}
      ORDER BY 
        CASE 
          WHEN BUSINESS_TAG IS NOT NULL THEN 1 
          ELSE 2 
        END,
        DEPARTMENT,
        SIZE_BAND
      LIMIT ?
    `;
    
    console.log('実行クエリ:', query);
    const results = await snowflakePersonaClient.executeQuery(query, [limit]);
    
    console.log(`検索結果: ${results.length}件のペルソナが見つかりました`);
    console.log('=== searchPersonasBySymptom 終了 ===');
    
    return results;
  } catch (error) {
    console.error('Error searching personas by symptom:', error);
    throw error;
  }
}

/**
 * 3M行対応の高度なペルソナ検索（業種・部署・規模・症状の組み合わせ）
 */
export async function searchPersonasAdvanced(
  filters: {
    businessTag?: string;
    department?: string;
    sizeBand?: string;
    symptoms?: string[];
    limit?: number;
  }
): Promise<any[]> {
  try {
    console.log('=== searchPersonasAdvanced 開始 ===');
    console.log('検索フィルター:', filters);
    
    const { businessTag, department, sizeBand, symptoms = [], limit = 100 } = filters;
    
    // 段階的絞り込み条件を構築
    const conditions = [];
    
    if (businessTag) {
      conditions.push(`UPPER(BUSINESS_TAG) LIKE UPPER('%${businessTag.replace(/'/g, "''")}%')`);
    }
    
    if (department) {
      conditions.push(`UPPER(DEPARTMENT) LIKE UPPER('%${department.replace(/'/g, "''")}%')`);
    }
    
    if (sizeBand) {
      conditions.push(`SIZE_BAND = '${sizeBand.replace(/'/g, "''")}'`);
    }
    
    if (symptoms.length > 0) {
      const symptomConditions = symptoms.map(symptom => {
        return `UPPER(SYMPTOM) LIKE UPPER('%${symptom.replace(/'/g, "''")}%')`;
      });
      conditions.push(`(${symptomConditions.join(' OR ')})`);
    }
    
    if (conditions.length === 0) {
      console.log('検索条件が指定されていません');
      return [];
    }
    
    // 最適化されたクエリ（3M行対応）
    const query = `
      SELECT 
        BUSINESS_TAG,
        DEPARTMENT,
        SIZE_BAND,
        CHALLENGE_NAME,
        SYMPTOM,
        RECOMMENDED_OUTBOUND_PLAY,
        PRIMARY_KPI,
        -- 関連度スコア（検索条件との一致度）
        CASE 
          WHEN ${businessTag ? `UPPER(BUSINESS_TAG) LIKE UPPER('%${businessTag}%')` : 'FALSE'} THEN 4
          ELSE 0
        END +
        CASE 
          WHEN ${department ? `UPPER(DEPARTMENT) LIKE UPPER('%${department}%')` : 'FALSE'} THEN 3
          ELSE 0
        END +
        CASE 
          WHEN ${sizeBand ? `SIZE_BAND = '${sizeBand}'` : 'FALSE'} THEN 2
          ELSE 0
        END +
        CASE 
          WHEN ${symptoms.length > 0 ? `UPPER(SYMPTOM) LIKE UPPER('%${symptoms[0]}%')` : 'FALSE'} THEN 1
          ELSE 0
        END as relevance_score
      FROM "PATTERNS"
      WHERE ${conditions.join(' AND ')}
      ORDER BY relevance_score DESC, BUSINESS_TAG, DEPARTMENT, SIZE_BAND
      LIMIT ?
    `;
    
    console.log('実行クエリ:', query);
    const results = await snowflakePersonaClient.executeQuery(query, [limit]);
    
    console.log(`検索結果: ${results.length}件のペルソナが見つかりました`);
    console.log('=== searchPersonasAdvanced 終了 ===');
    
    return results;
  } catch (error) {
    console.error('Error in advanced persona search:', error);
    throw error;
  }
}

/**
 * 全てのペルソナデータを取得（サンプル用）
 */
export async function getAllPersonas(limit: number = 50): Promise<any[]> {
  try {
    // まず、symptom列を含むテーブルを特定
    const tablesQuery = `
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = UPPER(?)
        AND COLUMN_NAME ILIKE '%symptom%'
      ORDER BY TABLE_NAME
    `;
    
    const tablesWithSymptom = await snowflakePersonaClient.executeQuery(tablesQuery, [snowflakePersonaConfig.schema]);
    
    if (tablesWithSymptom.length === 0) {
      console.log('symptom列を含むテーブルが見つかりませんでした');
      return [];
    }
    
    const targetTable = tablesWithSymptom[0].TABLE_NAME;
    
    const query = `SELECT * FROM ${targetTable} LIMIT ?`;
    const results = await snowflakePersonaClient.executeQuery(query, [limit]);
    
    return results;
  } catch (error) {
    console.error('Error getting all personas:', error);
    throw error;
  }
}

export { snowflakePersonaClient, SnowflakePersonaClient };
