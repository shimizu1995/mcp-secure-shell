import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { createMcpServer } from './mcp-server.js';

const app = express();

const { server: mcpServer, cleanup } = await createMcpServer();

let transport: SSEServerTransport;

app.get('/sse', async (req, res) => {
  console.log('Received connection');
  transport = new SSEServerTransport('/message', res);
  await mcpServer.connect(transport);

  mcpServer.server.onerror = (err) => {
    console.error(`Server onerror: ${err.stack}`);
  };

  mcpServer.server.onclose = async () => {
    console.log('Server onclose');
    if (process.env.KEEP_SERVER_OPEN !== '1') {
      await cleanup();
      await mcpServer.close();
      process.exit(0);
    }
  };
});

app.post('/message', async (req, res) => {
  console.log('Received message');
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
