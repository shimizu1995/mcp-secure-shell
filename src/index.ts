#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp-server.js';

async function main() {
  const transport = new StdioServerTransport();
  const { server, cleanup } = await createMcpServer();

  await server.connect(transport);

  // Cleanup on exit
  process.on('SIGINT', async () => {
    await cleanup();
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
