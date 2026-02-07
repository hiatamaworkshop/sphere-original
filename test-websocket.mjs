import WebSocket from 'ws';

async function testWebSocket() {
  console.log('=== WebSocket Connection Test ===\n');

  // Step 1: Get dive ticket
  const ticketRes = await fetch('http://localhost:3001/dive/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: 'test WebSocket connection' })
  });

  const ticketData = await ticketRes.json();
  console.log('✓ Dive ticket obtained:', ticketData.ticket.token.slice(0, 16) + '...\n');

  // Step 2: Connect via WebSocket
  const ws = new WebSocket(`ws://localhost:8081?token=${ticketData.ticket.token}`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    ws.on('open', () => {
      console.log('✓ WebSocket connected\n');
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('← Received:', msg.type);

      if (msg.type === 'session_start') {
        console.log('  Session ID:', msg.sessionId);
        console.log('  Energy:', msg.energy, '\n');

        // Test sense action
        console.log('→ Sending: sense');
        ws.send(JSON.stringify({ action: 'sense', radius: 0.5 }));
      }

      if (msg.type === 'sense_result') {
        console.log('  Nodes found:', msg.nodes.length);
        if (msg.nodes.length > 0) {
          console.log('  Sample node:', msg.nodes[0].summary, '\n');
        }

        // Test getField action
        console.log('→ Sending: getField');
        ws.send(JSON.stringify({ action: 'getField' }));
      }

      if (msg.type === 'field_result') {
        console.log('  Field intensity:', msg.field.intensity);
        console.log('  Volatility:', msg.field.volatility, '\n');

        // Test return
        console.log('→ Sending: return');
        ws.send(JSON.stringify({ action: 'return' }));
      }

      if (msg.type === 'session_end') {
        console.log('✓ Session ended gracefully\n');
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      console.log('✓ WebSocket closed\n');
      clearTimeout(timeout);
      resolve();
    });
  });
}

testWebSocket()
  .then(() => {
    console.log('=== WebSocket Test: PASSED ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error('=== WebSocket Test: FAILED ===');
    console.error(err.message);
    process.exit(1);
  });
