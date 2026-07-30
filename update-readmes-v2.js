const fs = require('fs');
const path = require('path');

const rotatorSection = `---

#### \`fheenv rotator add\`

Grant a wallet address the \`Rotator\` role for a specific project. A Rotator can only re-encrypt environments but cannot manage team members or transfer ownership. This is intended for automated CI/CD keys (e.g. GitHub Actions).

\`\`\`bash
fheenv rotator add --address 0xAutomationAddress
\`\`\`

| Flag                        | Default  | Description                                 |
| --------------------------- | -------- | ------------------------------------------- |
| \`-a, --address <address>\` | required | Ethereum address to grant the Rotator role. |

---

#### \`fheenv rotator remove\`

Revoke the \`Rotator\` role from a wallet address. 

\`\`\`bash
fheenv rotator remove --address 0xAutomationAddress
\`\`\`

| Flag                        | Default  | Description                                  |
| --------------------------- | -------- | -------------------------------------------- |
| \`-a, --address <address>\` | required | Ethereum address to revoke the Rotator role. |`;

const ciReplacement = `# ── CI/CD: Automated Key Rotation ─────────────────────────────────────────────

# In your CI pipeline (GitHub Actions), use a dedicated Rotator key:
# 1. Generate a new wallet for rotation
fheenv generate-rotator

# 2. Grant it the Rotator role (as an Admin)
fheenv rotator add --address 0xNewRotatorAddress

# 3. Add its private key to GitHub Actions as FHEENV_PRIVATE_KEY
# 4. GitHub Actions will now automatically rotate keys periodically!

# ── CI/CD: Application Deployment ─────────────────────────────────────────────

# In your deployment pipeline, use a read-only Deploy key:
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start`;


function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    let updated = false;

    // 1. Add Rotator commands
    if (!content.includes('fheenv rotator add')) {
        const teamRemoveSectionStr = '#### `fheenv team remove`';
        const teamRemoveIdx = content.indexOf(teamRemoveSectionStr);
        if (teamRemoveIdx !== -1) {
            const afterRemoveStr = '---';
            const insertIdx = content.indexOf(afterRemoveStr, teamRemoveIdx + teamRemoveSectionStr.length + 50);
            if (insertIdx !== -1) {
                content = content.slice(0, insertIdx + afterRemoveStr.length) + '\n\n' + rotatorSection + '\n' + content.slice(insertIdx + afterRemoveStr.length);
                updated = true;
            }
        }
    }

    // 2. Update CI/CD Section
    const oldCiBlock1 = `# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your GitHub Actions workflow:
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start`;

    const oldCiBlock2 = `# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your CI pipeline (GitHub Actions, etc.):
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start`;

    if (content.includes(oldCiBlock1)) {
        content = content.replace(oldCiBlock1, ciReplacement);
        updated = true;
    } else if (content.includes(oldCiBlock2)) {
        content = content.replace(oldCiBlock2, ciReplacement);
        updated = true;
    }

    if (updated) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No changes made to ${filePath}`);
    }
}

processFile('README.md');
processFile(path.join('fheenv', 'README.md'));
