import { db } from "../src/config/db.js";
import { ChatService } from "../src/services/ChatService.js";
import { customers, user } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function testChatService() {
  console.log("🧪 Testing Claude Agent SDK through ChatService...\n");

  try {
    // Find windows user
    const windowsUser = await db
      .select()
      .from(user)
      .where(eq(user.email, "windows@example.com"))
      .limit(1);

    if (!windowsUser.length) {
      throw new Error("User not found. Run: npm run db:seed");
    }

    // Find customer
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, windowsUser[0].id))
      .limit(1);

    if (!customer.length) {
      throw new Error("Customer not found");
    }

    console.log("Customer:", customer[0].name);
    console.log("Site folder:", customer[0].siteFolder);
    console.log();

    // Create a chat session
    console.log("Step 1: Creating chat session...");
    const session = await ChatService.createSession(customer[0].id);
    console.log("✅ Session created:", session.id);
    console.log();

    // Send a message
    console.log("Step 2: Sending message to Claude Agent...");
    const testMessage =
      "Can you please change the phone number accross the whole website to be the mobile number that is in the header";
    console.log("Message:", testMessage);
    console.log();
    console.log(
      "⏳ Waiting for Claude Agent to process (may take 20-40 seconds)..."
    );
    console.log();

    const message = await ChatService.sendMessage(
      session.id,
      customer[0].id,
      testMessage
    );

    console.log("═".repeat(70));
    console.log("Claude Agent Response:");
    console.log("═".repeat(70));
    console.log();
    console.log(message.content);
    console.log();
    console.log("═".repeat(70));
    console.log("Metadata:");
    console.log("═".repeat(70));
    console.log("Flagged:", message.flagged);
    console.log("Message ID:", message.id);
    console.log("Created:", message.createdAt);
    console.log();

    // Verify file changes
    console.log("Step 3: Verifying file changes...");
    const { execSync } = await import("child_process");
    try {
      const result = execSync(
        'grep -i "1-800-SPARKLE\\|1-800-772-7553" /home/jakedawson/upserver/sites/complete-windows/index.html',
        { encoding: "utf-8" }
      ).trim();

      if (result) {
        console.log("✅ File was successfully modified!");
        console.log("   Found:", result.substring(0, 100) + "...");
      }
    } catch (error) {
      console.log("⚠️  Could not find the new phone number in the file");
    }

    console.log();
    console.log("✅ Chat Service test completed successfully!");
    console.log();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

testChatService();
