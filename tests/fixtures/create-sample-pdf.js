// Generates a minimal but valid 1-page PDF at fixtures/sample.pdf.
// Run once: node fixtures/create-sample-pdf.js
// No extra npm dependencies required.

const fs = require('fs');
const path = require('path');

const text = [
  'Research Paper: An Introduction to Retrieval-Augmented Generation',
  '',
  'Abstract:',
  'Retrieval-Augmented Generation (RAG) combines the parametric knowledge of large language',
  'models with non-parametric retrieval from external knowledge bases. This paper presents a',
  'comprehensive overview of the RAG framework and its applications in natural language processing.',
  '',
  'Introduction:',
  'Large language models have demonstrated remarkable capabilities across a wide range of tasks.',
  'However, these models are limited by their training data cutoff and may hallucinate facts.',
  'Retrieval-augmented approaches address these limitations by grounding model outputs in',
  'retrieved documents from external knowledge sources.',
  '',
  'Methods:',
  'We implement a dense retrieval system using FAISS for efficient approximate nearest neighbor',
  'search over document embeddings. The retriever scores each candidate document against the',
  'query using cosine similarity of dense vector representations.',
  '',
  'Results:',
  'Our experiments on knowledge-intensive NLP tasks demonstrate significant improvements over',
  'baseline language models. The RAG system achieves higher factual accuracy and lower',
  'hallucination rates compared to standard language model baselines.',
  '',
  'Conclusion:',
  'Retrieval-augmented generation represents a promising direction for building more reliable',
  'and factually grounded language systems. Future work will explore dynamic retrieval',
  'strategies and more efficient indexing methods for large-scale knowledge bases.',
].join('\n');

// Build PDF content stream
const lines = text.split('\n');
let streamContent = 'BT\n/F1 11 Tf\n';
let y = 750;
for (const line of lines) {
  const safe = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  streamContent += `50 ${y} Td (${safe}) Tj\n`;
  streamContent += `50 ${y} Td () Tj\n`;
  y -= 15;
  if (y < 50) break;
}
streamContent += 'ET\n';

// Build PDF structure
const stream = Buffer.from(streamContent, 'latin1');
const streamLen = stream.length;

let pdf = '';
const offsets = [];

const addObj = (content) => {
  offsets.push(pdf.length);
  pdf += content;
};

pdf += '%PDF-1.4\n';

// Obj 1: Catalog
addObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
// Obj 2: Pages
addObj(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
// Obj 3: Page
addObj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`);
// Obj 4: Content stream
addObj(`4 0 obj\n<< /Length ${streamLen} >>\nstream\n`);
const beforeStream = pdf.length;
pdf += streamContent;
pdf += `\nendstream\nendobj\n`;
// Obj 5: Font
addObj(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

// xref table
const xrefOffset = pdf.length;
pdf += 'xref\n';
pdf += `0 ${offsets.length + 1}\n`;
pdf += '0000000000 65535 f \n';
for (const off of offsets) {
  pdf += String(off).padStart(10, '0') + ' 00000 n \n';
}

pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

const outPath = path.join(__dirname, 'sample.pdf');
fs.writeFileSync(outPath, pdf, 'latin1');
console.log(`Created ${outPath} (${pdf.length} bytes)`);
