/**
 * One-time ES Module -> CommonJS conversion script for backend JS files.
 */
const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "..");

function walkDir(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "convert-to-cjs.js") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function stripJsExtension(specifier) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    return specifier.slice(0, -3);
  }
  return specifier;
}

function convertImports(content) {
  // Multi-line import { ... } from "..."
  content = content.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*\n/g,
    (_, names, source) => {
      const cleanSource = stripJsExtension(source);
      return `const {${names}} = require("${cleanSource}");\n`;
    }
  );

  // import * as X from "..."
  content = content.replace(
    /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*\n/g,
    (_, name, source) => {
      const cleanSource = stripJsExtension(source);
      return `const ${name} = require("${cleanSource}");\n`;
    }
  );

  // import X from "..."
  content = content.replace(
    /import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*\n/g,
    (_, name, source) => {
      const cleanSource = stripJsExtension(source);
      return `const ${name} = require("${cleanSource}");\n`;
    }
  );

  return content;
}

function removeEsmDirname(content) {
  content = content.replace(
    /import\s+\{\s*fileURLToPath\s*\}\s+from\s+['"]url['"];?\s*\n/g,
    ""
  );
  content = content.replace(
    /const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\);\s*\n/g,
    ""
  );
  content = content.replace(
    /const\s+__dirname\s*=\s*path\.dirname\(__filename\);\s*\n/g,
    ""
  );
  content = content.replace(
    /const\s+__dirname\s*=\s*path\.dirname\(fileURLToPath\(import\.meta\.url\)\);\s*\n/g,
    ""
  );
  return content;
}

function convertExports(content) {
  const namedExports = [];

  // export { a, b, c };
  content = content.replace(/export\s+\{([^}]+)\};?\s*\n/g, (_, names) => {
    return `module.exports = { ${names.trim()} };\n`;
  });

  // export default ...
  content = content.replace(/export\s+default\s+(.+);?\s*$/gm, (_, expr) => {
    return `module.exports = ${expr.trim()};`;
  });

  // export async function name
  content = content.replace(/export\s+async\s+function\s+(\w+)/g, (_, name) => {
    namedExports.push(name);
    return `async function ${name}`;
  });

  // export function name
  content = content.replace(/export\s+function\s+(\w+)/g, (_, name) => {
    namedExports.push(name);
    return `function ${name}`;
  });

  // export const name
  content = content.replace(/export\s+const\s+(\w+)/g, (_, name) => {
    namedExports.push(name);
    return `const ${name}`;
  });

  if (namedExports.length > 0) {
    const exportLines = namedExports.map((n) => `module.exports.${n} = ${n};`).join("\n");
    if (!content.includes(`module.exports.${namedExports[0]}`)) {
      content = content.trimEnd() + "\n\n" + exportLines + "\n";
    }
  }

  return content;
}

function convertFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  if (!/\b(import |export )/.test(content)) {
    return false;
  }

  content = convertImports(content);
  content = removeEsmDirname(content);
  content = convertExports(content);

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

const files = walkDir(BACKEND_ROOT);
let converted = 0;

for (const file of files) {
  if (convertFile(file)) {
    converted++;
    console.log("Converted:", path.relative(BACKEND_ROOT, file));
  }
}

console.log(`\nDone. Converted ${converted} file(s).`);
