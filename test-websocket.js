// Simple test script to verify WebSocket connection
// Run with: node test-websocket.js

const { io } = require('socket.io-client');

const token = process.argv[2] || 'YOUR_TOKEN_HERE';

console.log('Attempting to connect to WebSocket...');
console.log('Token:', token.substring(0, 20) + '...');

const socket = io('http://localhost:3000/live', {
  auth: {
    token: token
  },
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 5000,
});

socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);
  console.log('✅ Connection successful!');
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.error('Error details:', error);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Connection timeout after 10 seconds');
  socket.disconnect();
  process.exit(1);
}, 10000);

