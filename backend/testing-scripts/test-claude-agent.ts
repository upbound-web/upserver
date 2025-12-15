import { ClaudeAgentService } from './src/services/ClaudeAgentService.js';

async function testClaudeAgent() {
  console.log('🧪 Testing Claude Agent SDK with window cleaning website...\n');

  const customerId = 'test-customer-123';
  const customerSiteFolder = 'complete-windows';
  const userMessage = 'Please add a new section at the bottom of the homepage that says "Book Your Free Quote Today!" with a phone number: 555-0123';

  console.log('Customer Site:', customerSiteFolder);
  console.log('Request:', userMessage);
  console.log('\n--- Starting Claude Agent ---\n');

  try {
    const result = await ClaudeAgentService.processRequest(
      customerId,
      customerSiteFolder,
      userMessage,
      [] // Empty conversation history
    );

    console.log('\n--- Agent Response ---\n');
    console.log(result.response);
    console.log('\n--- Result Summary ---');
    console.log('Flagged:', result.flagged);
    console.log('Files Modified:', result.filesModified || 'None');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testClaudeAgent();
