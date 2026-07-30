const fs = require('fs');
const path = require('path');

const replacement = `# ── CI/CD: Automated Key Rotation ─────────────────────────────────────────────

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
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start
\`\`\``;

function updateCI(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    
    const target = `# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your GitHub Actions workflow:
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start
\`\`\``;
    
    const target2 = `# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your CI pipeline (GitHub Actions, etc.):
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=\${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start
\`\`\``;
    
    if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(filePath, content);
        console.log(`Updated CI/CD section in ${filePath}`);
    } else if (content.includes(target2)) {
        content = content.replace(target2, replacement);
        fs.writeFileSync(filePath, content);
        console.log(`Updated CI/CD section in ${filePath} (target2)`);
    } else {
        console.log(`Target CI/CD section not found in ${filePath}`);
    }
}

updateCI('README.md');
updateCI(path.join('fheenv', 'README.md'));
