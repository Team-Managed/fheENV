const fs = require('fs');

function updatePlan() {
    const filePath = 'docs/plans/2026-07-08-soc2-key-rotation.md';
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Find the start of the section
    const startStr = '## Open Finding — Rotator Key Custody: OIDC + Lit Protocol Threshold Signing (F-01)';
    const startIdx = content.indexOf(startStr);
    
    if (startIdx !== -1) {
        // Find the start of the next section
        const endStr = '## Execution Order';
        const endIdx = content.indexOf(endStr, startIdx);
        
        if (endIdx !== -1) {
            const replacement = \`## Resolved Finding — Rotator Key Custody (F-01)

The Rotator key custody is securely handled via GitHub Actions Secrets (\`FHEENV_PRIVATE_KEY\` / \`FHEENV_ROTATOR_KEY\`) rather than a complex Lit Protocol setup.
This provides a native, low-friction integration where automation is gated strictly by GitHub repository permissions. The Rotator role guarantees least privilege by ensuring this key can only rotate keys and cannot manage users.

---

\`;
            content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
            fs.writeFileSync(filePath, content);
            console.log('Updated ' + filePath);
        }
    }
}

function updatePolicy() {
    const filePath = 'docs/policies/access-control-key-rotation-policy.md';
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Replace the Lit Protocol row in the table
    const target = '| **Rotator credential** (Lit Protocol TEE) | Executes §4.3 and §4.4; holds no team-management or ownership privilege (§4.5); key never leaves the TEE                         |';
    const replacement = '| **Rotator credential** (GitHub Actions Secret) | Executes §4.3 and §4.4; holds no team-management or ownership privilege (§4.5); key is securely held as a CI secret |';
    
    if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(filePath, content);
        console.log('Updated ' + filePath);
    }
}

updatePlan();
updatePolicy();
