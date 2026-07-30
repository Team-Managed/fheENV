/**
 * setup-github-rotator.ts
 *
 * Generates a throwaway "Robot Wallet" for automated GitHub Actions rotation.
 * 
 * Usage:
 *   npx ts-node scripts/setup-github-rotator.ts
 */

import { Wallet } from "ethers";

console.log("\n🤖 Generating a new Robot Wallet for GitHub Actions...\n");

const robot = Wallet.createRandom();

console.log("========================================================");
console.log(`🤖 ROBOT ADDRESS: ${robot.address}`);
console.log(`🔑 PRIVATE KEY:   ${robot.privateKey}`);
console.log("========================================================\n");

console.log("✅ STEP 1: Add the Secret to GitHub");
console.log("   Go to your GitHub Repository -> Settings -> Secrets and Variables -> Actions");
console.log("   Add a new Repository Secret:");
console.log("   Name:  FHEENV_PRIVATE_KEY");
console.log(`   Value: ${robot.privateKey}\n`);

console.log("✅ STEP 2: Grant the Robot the Rotator Role");
console.log("   Run this command in your terminal to tell the smart contract");
console.log("   that this Robot is allowed to trigger rotations:");
console.log(`   npx fheenv rotator add --address ${robot.address}\n`);

console.log("🎉 You're done! The .github/workflows/rotate.yml will now run securely.\n");
