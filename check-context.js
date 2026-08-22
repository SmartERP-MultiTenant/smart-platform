const fs = require('fs');
const path = require('path');

const contextRoot = path.join(__dirname, '.agents', 'context');
const headerRegex = /^<!-- Context: .* -->/;
const markdownLinkRegex = /\[[^\]]*\]\(([^)]+)\)/g;

let error = false;
let fileCount = 0;

function rel(filePath) {
  return path
    .relative(path.join(__dirname, '.agents'), filePath)
    .replace(/\\/g, '/');
}

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdown(full);
    }
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const files = listMarkdown(contextRoot);

// 1. every context file starts with an MVI header comment
for (const file of files) {
  fileCount += 1;
  const content = fs.readFileSync(file, 'utf8');
  const firstLine = content.split('\n')[0];
  if (!headerRegex.test(firstLine)) {
    error = true;
    console.error(
      `Missing header: ${rel(file)} — first line must be "<!-- Context: ... -->"`
    );
  }
}

// 2. every category directory has a navigation.md
const categories = fs
  .readdirSync(contextRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
for (const category of categories) {
  const nav = path.join(contextRoot, category.name, 'navigation.md');
  if (!fs.existsSync(nav)) {
    error = true;
    console.error(`Missing navigation.md in category: ${category.name}`);
  }
}

// 3. every category directory is listed in the top-level navigation.md
const topNavContent = fs.readFileSync(
  path.join(contextRoot, 'navigation.md'),
  'utf8'
);
const topNavLinks = [];
for (const match of topNavContent.matchAll(markdownLinkRegex)) {
  const link = match[1];
  if (/^(https?:|mailto:|#)/.test(link)) {
    continue;
  }
  topNavLinks.push(link.split('#')[0]);
}
for (const category of categories) {
  if (!topNavLinks.includes(`${category.name}/navigation.md`)) {
    error = true;
    console.error(
      `Category not listed in top-level navigation.md: ${category.name}`
    );
  }
}

// 3. every relative markdown link inside a navigation.md resolves on disk
for (const file of files) {
  if (!file.endsWith(path.sep + 'navigation.md')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(markdownLinkRegex)) {
    const link = match[1];
    if (/^(https?:|mailto:|#)/.test(link)) {
      continue;
    }
    const stripped = link.split('#')[0];
    if (!stripped) {
      continue;
    }
    const target = path.resolve(path.dirname(file), stripped);
    if (!fs.existsSync(target)) {
      error = true;
      console.error(`Broken link in ${rel(file)}: ${link} (→ ${rel(target)})`);
    }
  }
}

console.log(
  `Checked ${fileCount} markdown files and ${categories.length} categories in .agents/context`
);
if (error) {
  console.error('context:validate FAILED');
  process.exit(1);
}
console.log('context:validate PASSED');
