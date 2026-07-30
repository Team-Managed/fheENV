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
| \`-a, --address <address>\` | required | Ethereum address to revoke the Rotator role. |

`;

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if already updated
    if (content.includes('fheenv rotator add')) return;
    
    // Find the end of `team remove` command docs
    const teamRemoveSectionEnd = content.indexOf('---', content.indexOf('#### `fheenv team remove`') + 50);
    
    if (teamRemoveSectionEnd !== -1) {
        // Insert right after the `team remove` section's trailing `---`
        content = content.slice(0, teamRemoveSectionEnd + 3) + '\n\n' + rotatorSection.trim() + '\n\n' + content.slice(teamRemoveSectionEnd + 3);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath} with rotator commands.`);
    }
}

processFile('README.md');
processFile(path.join('fheenv', 'README.md'));
