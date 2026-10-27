// The real server over stdio, with an empty home (not signed in) and no sign-in client set up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');

test('lists the tools and, not signed in, says the connector needs setting up', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-mcp-home-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home }, stderr: 'ignore' });
  const client = new Client({ name: 'test', version: '0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['list_spaces', 'list_notes', 'search_notes', 'read_note', 'create_note', 'append_to_note', 'update_note', 'delete_note']);
    assert.equal(tools.find(t => t.name === 'read_note').annotations.readOnlyHint, true);
    const r = await client.callTool({ name: 'list_spaces', arguments: {} });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /not set up yet \(no Google sign-in client\)/);
  } finally {
    await client.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
