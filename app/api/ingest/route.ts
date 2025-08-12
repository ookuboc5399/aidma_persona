
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { text, source } = await req.json();

    if (!text || !source) {
      return NextResponse.json({ error: 'text and source are required' }, { status: 400 });
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(text);

    for (const chunk of chunks) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      });

      const embedding = embeddingResponse.data[0].embedding;

      const { error } = await supabase.from('knowledge_documents').insert({
        chunk,
        embedding,
      });

      if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ success: true, message: `Ingested ${chunks.length} chunks from ${source}` });
  } catch (error) {
    console.error('Ingest API error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
