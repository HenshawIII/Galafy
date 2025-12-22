/**
 * Simple Redis connection test script
 * Run with: npm run redis:test
 */

import { createClient } from 'redis';
import { config } from 'dotenv';

config();

async function testRedis() {
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  client.on('error', (err) => {
    console.error('❌ Redis Client Error:', err.message);
    process.exit(1);
  });

  try {
    console.log('🔄 Connecting to Redis...');
    await client.connect();
    console.log('✅ Connected to Redis successfully!');

    // Test SET operation
    console.log('\n🔄 Testing SET operation...');
    await client.set('test:key', 'Hello Redis!');
    console.log('✅ SET operation successful');

    // Test GET operation
    console.log('\n🔄 Testing GET operation...');
    const value = await client.get('test:key');
    console.log(`✅ GET operation successful. Value: "${value}"`);

    // Test DELETE operation
    console.log('\n🔄 Testing DELETE operation...');
    await client.del('test:key');
    console.log('✅ DELETE operation successful');

    // Test with TTL
    console.log('\n🔄 Testing SET with TTL (5 seconds)...');
    await client.setEx('test:ttl', 5, 'This will expire in 5 seconds');
    const ttlValue = await client.get('test:ttl');
    console.log(`✅ Value set with TTL: "${ttlValue}"`);

    // Get TTL
    const remainingTTL = await client.ttl('test:ttl');
    console.log(`✅ Remaining TTL: ${remainingTTL} seconds`);

    console.log('\n🎉 All Redis tests passed!');
    console.log('\n📝 Redis is ready to use in your application.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
    console.log('\n✅ Disconnected from Redis');
  }
}

testRedis();
