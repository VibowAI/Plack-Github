const fs = require('fs');
const code = fs.readFileSync('components/ChatInterface.tsx', 'utf8');

const declarations = [];
let match;
// Basic regex to find declarations
const declRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=/g;

while ((match = declRegex.exec(code)) !== null) {
    declarations.push({ name: match[1], index: match.index });
}

// Find useEffects and their deps
const useEffectRegex = /useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[(.*?)\]\s*\)/g;
while ((match = useEffectRegex.exec(code)) !== null) {
    const deps = match[2].split(',').map(d => d.trim().replace(/[^a-zA-Z0-9_]/g, ''));
    const effectIndex = match.index;
    for (const dep of deps) {
        if (!dep) continue;
        const decl = declarations.find(d => d.name === dep);
        if (decl && decl.index > effectIndex) {
            console.log(`WARNING: Dep '${dep}' used in useEffect at index ${effectIndex} but declared at ${decl.index}`);
        }
    }
}
