import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import mammoth from 'mammoth';

export const maxDuration = 60;

const NOTEBOOK_ID = '4af61e2f-a5c4-49c3-84d6-9926ac39e270';

// Binary Word formats → extract with mammoth
const WORD_EXTS = ['.doc', '.docx'];

// Google Docs shortcut — contains JSON with the doc URL/ID
const GDOC_EXTS = ['.gdoc', '.gsheet', '.gslides'];

// Plain text formats — read as UTF-8 directly
const TEXT_EXTS = ['.txt', '.md', '.rtf', '.csv', '.json', '.html', '.htm',
                   '.xml', '.yaml', '.yml', '.log', '.odt'];

// Rejected — need binary upload path not available on Vercel
const BINARY_REJECT = ['.pdf', '.png', '.jpg', '.jpeg'];

function getExt(name: string) {
  return ('.' + name.split('.').pop()?.toLowerCase()) as string;
}

async function extractText(file: File, ext: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (WORD_EXTS.includes(ext)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // All other accepted formats: plain UTF-8
  return buffer.toString('utf-8');
}

function extractGDocId(json: string): string | null {
  try {
    const parsed = JSON.parse(json);
    // .gdoc files have a "url" field like https://docs.google.com/document/d/DOC_ID/edit
    const url: string = parsed.url ?? parsed.doc_id ?? '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = getExt(file.name);
  const title = file.name.replace(/\.[^.]+$/, '');

  if (BINARY_REJECT.includes(ext)) {
    return NextResponse.json(
      { error: `${ext} files must be added via the NotebookLM web UI — binary upload is not supported here.` },
      { status: 400 }
    );
  }

  const isSupported = [...WORD_EXTS, ...GDOC_EXTS, ...TEXT_EXTS].includes(ext);
  if (!isSupported) {
    // Accept it anyway as plain text — NotebookLM will handle what it can
  }

  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  let result;

  if (GDOC_EXTS.includes(ext)) {
    // Parse the .gdoc shortcut and add directly from Google Drive
    const raw = Buffer.from(await file.arrayBuffer()).toString('utf-8');
    const docId = extractGDocId(raw);

    if (!docId) {
      await client.close();
      return NextResponse.json(
        { error: 'Could not read Google Doc ID from this file. Try exporting as .docx instead.' },
        { status: 400 }
      );
    }

    result = await client.callTool({
      name: 'source_add',
      arguments: {
        notebook_id: NOTEBOOK_ID,
        source_type: 'drive',
        document_id: docId,
        title,
      },
    });
  } else {
    // Extract text and add as text source
    const text = await extractText(file, ext);

    if (!text.trim()) {
      await client.close();
      return NextResponse.json({ error: 'File appears to be empty or unreadable' }, { status: 400 });
    }

    result = await client.callTool({
      name: 'source_add',
      arguments: {
        notebook_id: NOTEBOOK_ID,
        source_type: 'text',
        text,
        title,
      },
    });

    await client.close();

    const response = Array.isArray(result.content)
      ? result.content.map((c: { text?: string }) => c.text ?? '').join('\n')
      : String(result.content);
    const idMatch = response.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);

    return NextResponse.json({
      success: true,
      sourceId: idMatch?.[0] ?? null,
      title: file.name,
      characters: text.length,
    });
  }

  await client.close();

  const response = Array.isArray(result.content)
    ? result.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(result.content);
  const idMatch = response.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);

  return NextResponse.json({
    success: true,
    sourceId: idMatch?.[0] ?? null,
    title: file.name,
    characters: 0,
  });
}
