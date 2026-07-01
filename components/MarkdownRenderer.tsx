'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard as globalCopyToClipboard } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  theme?: 'light' | 'dark' | 'cosmic';
}

// Strictly Typed Block definitions for full TypeScript type safety narrowing
interface HeaderBlock { type: 'header'; level: number; text: string; }
interface CodeBlockItem { type: 'code'; language: string; text: string; }
interface TableBlock { type: 'table'; headers: string[]; rows: string[][]; }
interface ListBlock { type: 'list'; ordered: boolean; items: string[]; }
interface MathBlock { type: 'math'; text: string; }
interface ParagraphBlock { type: 'paragraph'; text: string; }

type Block = HeaderBlock | CodeBlockItem | TableBlock | ListBlock | MathBlock | ParagraphBlock;

export default function MarkdownRenderer({ content, theme = 'light' }: MarkdownRendererProps) {
  if (!content) return null;

  const isLight = theme === 'light';
  const isCosmic = theme === 'cosmic';
  const isDark = theme === 'dark';

  // Pre-process text to remove inline <thought>...</thought> tags if they exist.
  // Although the page level will parse out the reasoning block, this is a safety measure.
  const processedContent = content.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

  // Parse blocks (code blocks, tables, lists, headers, math, normal paragraphs)
  const blocks = parseBlocks(processedContent);

  // Styling helper classes matching theme contrast requirements
  const containerTextClass = isLight 
    ? "text-neutral-800 selection:bg-slate-100 selection:text-black" 
    : isCosmic 
      ? "text-[#D9D9D9] selection:bg-indigo-950 selection:text-white" 
      : "text-[#B3B3B3] selection:bg-neutral-800 selection:text-white";

  return (
    <div className={`space-y-5 leading-8 max-w-full font-sans ${containerTextClass}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'header': {
            const headerLevel = block.level;
            const hColor = isLight 
              ? (headerLevel === 1 ? 'text-neutral-900' : headerLevel === 2 ? 'text-neutral-800' : 'text-neutral-750')
              : 'text-white';
            const hSize = headerLevel === 1 
              ? 'text-2.5xl font-semibold mt-10 mb-4 tracking-tight'
              : headerLevel === 2
              ? 'text-1.5xl font-semibold mt-8 mb-3 tracking-tight'
              : 'text-xl font-medium mt-6 mb-2 tracking-tight';
            
            return (
              <div key={index} className="group relative flex items-baseline">
                {React.createElement(
                  `h${headerLevel}`, 
                  { className: `${hColor} ${hSize} w-full` }, 
                  renderInline(block.text, theme)
                )}
              </div>
            );
          }

          case 'code':
            return (
              <CodeBlock 
                key={index} 
                language={block.language} 
                code={block.text} 
                theme={theme}
              />
            );

          case 'table':
            return (
              <div key={index} className={`my-6 overflow-x-auto border rounded-2xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.02)] ${isLight ? 'border-neutral-200/60' : isCosmic ? 'border-indigo-500/10' : 'border-neutral-800'}`}>
                <table className="min-w-full divide-y table-auto text-[14px]">
                  <thead className={isLight ? 'bg-neutral-50/70 border-b border-neutral-200/40' : isCosmic ? 'bg-indigo-950/40 border-b border-indigo-500/15' : 'bg-neutral-950/60 border-b border-neutral-800'}>
                    <tr>
                      {block.headers.map((h, i) => (
                        <th 
                          key={i} 
                          className={`px-5 py-3 text-left font-semibold uppercase tracking-wider text-[11px] ${isLight ? 'text-neutral-550 border-r border-neutral-200/20' : 'text-neutral-450 border-r border-neutral-800/40'} last:border-0`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-neutral-100 bg-white text-neutral-700' : isCosmic ? 'divide-indigo-500/10 bg-black/20 text-[#D9D9D9]' : 'divide-neutral-800 bg-[#0A0A0A]/30 text-[#B3B3B3]'}`}>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={isLight ? 'hover:bg-neutral-50/30' : 'hover:bg-white/5'}>
                        {row.map((cell, cellIndex) => (
                          <td 
                            key={cellIndex} 
                            className={`px-5 py-3.5 border-r ${isLight ? 'border-neutral-150/10' : 'border-neutral-800/20'} last:border-0`}
                          >
                            {renderInline(cell, theme)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            const listClass = `space-y-3.5 pl-1 my-5 text-[15px] ${isLight ? 'text-neutral-800' : isCosmic ? 'text-[#D9D9D9]' : 'text-[#B3B3B3]'}`;
            
            return (
              <ListTag key={index} className={listClass}>
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-3 items-baseline leading-relaxed">
                    {block.ordered ? (
                      <span className={`font-semibold min-w-[14px] text-right text-[13px] mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>{i + 1}.</span>
                    ) : (
                      <span className={`font-bold text-sm ${isLight ? 'text-neutral-400' : 'text-neutral-500'}`}>•</span>
                    )}
                    <span className="leading-relaxed flex-1">{renderInline(item, theme)}</span>
                  </li>
                ))}
              </ListTag>
            );
          }

          case 'math':
            return (
              <div 
                key={index} 
                className={`my-6 p-6 rounded-2xl text-center overflow-x-auto ${isLight ? 'bg-neutral-50/60 border border-neutral-200/50' : isCosmic ? 'bg-indigo-950/20 border border-indigo-500/10' : 'bg-[#0E0E0E] border border-neutral-800'}`}
              >
                <code className={`text-sm font-mono select-all block whitespace-pre ${isLight ? 'text-neutral-800' : 'text-white'}`}>
                  {block.text}
                </code>
              </div>
            );

          default:
            return (
              <p key={index} className="text-[15.5px] leading-8 font-normal py-1 tracking-normal font-sans">
                {renderInline(block.text, theme)}
              </p>
            );
        }
      })}
    </div>
  );
}

// Sub-component to render beautifully designed code blocks with click-to-copy
function CodeBlock({ language, code, theme = 'light' }: { language: string; code: string; theme?: 'light' | 'dark' | 'cosmic' }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    const success = await globalCopyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group relative border border-slate-200 bg-[#0F172A] rounded-2xl overflow-hidden shadow-xl my-6 font-mono text-xs">
      <div className="flex items-center justify-between px-5 py-3 bg-[#1E293B] border-b border-slate-700/50 text-[11px] text-slate-400 font-sans tracking-wide">
        <div className="flex gap-1.5 items-center mr-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400/50"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50"></div>
          <span className="ml-2 lowercase font-mono opacity-80">{language || 'text'}</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="text-[10px] bg-slate-700/50 hover:bg-slate-700 px-2.5 py-1 rounded text-slate-300 transition-colors active:scale-95 cursor-pointer"
        >
          {copied ? 'Copied' : 'Copy Code'}
        </button>
      </div>
      <div className="p-6 overflow-x-auto leading-6">
        <code className="block pr-4 select-text whitespace-pre text-slate-300 font-mono text-[13px]">
          {code}
        </code>
      </div>
    </div>
  );
}

// Split the full text into component blocks
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for code blocks
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim() || 'text';
      let codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing backticks
      blocks.push({
        type: 'code',
        language,
        text: codeLines.join('\n')
      });
      continue;
    }

    // Check for math equations defined as blocks (starts with $$)
    if (line.trim().startsWith('$$')) {
      let mathLines = [];
      // If of format $$ equation $$ on single line
      if (line.trim().slice(2).endsWith('$$') && line.trim().length > 4) {
        blocks.push({
          type: 'math',
          text: line.trim().slice(2, -2).trim()
        });
        i++;
        continue;
      }
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      i++; // skip closing $$
      blocks.push({
        type: 'math',
        text: mathLines.join('\n')
      });
      continue;
    }

    // Check for lists (unordered or ordered)
    if (isListLine(line)) {
      const items: string[] = [];
      const ordered = isOrderedListLine(line);
      
      while (i < lines.length && isListLine(lines[i])) {
        items.push(cleanListLine(lines[i]));
        i++;
      }
      
      blocks.push({
        type: 'list',
        ordered,
        items
      });
      continue;
    }

    // Check for tables
    if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().includes('|') && lines[i + 1].trim().includes('-')) {
      const headers = parseTableRow(line);
      // skip separator row
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({
        type: 'table',
        headers,
        rows
      });
      continue;
    }

    // Check for headers
    if (line.trim().startsWith('#')) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        blocks.push({
          type: 'header',
          level: match[1].length,
          text: match[2].trim()
        });
        i++;
        continue;
      }
    }

    // Unused / empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Standard markdown paragraph block (group consecutive non-empty plain lines)
    let paragraphLines = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('$$') && !isListLine(lines[i]) && !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('#')) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join('\n')
    });
  }

  return blocks;
}

// Helper block parsers
function isListLine(line: string): boolean {
  const clean = line.trim();
  return clean.startsWith('- ') || clean.startsWith('* ') || clean.startsWith('+ ') || /^\d+\.\s/.test(clean);
}

function isOrderedListLine(line: string): boolean {
  return /^\d+\.\s/.test(line.trim());
}

function cleanListLine(line: string): string {
  const clean = line.trim();
  if (clean.startsWith('- ') || clean.startsWith('* ') || clean.startsWith('+ ')) {
    return clean.slice(2).trim();
  }
  const match = clean.match(/^\d+\.\s+(.*)$/);
  return match ? match[1].trim() : clean;
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1) // remove empty leading and trailing split elements due to leading/trailing |
    .map(cell => cell.trim());
}

// Inline formatting parser (bold, italic, inline code, inline math, links)
function renderInline(text: string, theme: 'light' | 'dark' | 'cosmic' = 'light'): React.ReactNode[] {
  if (!text) return [];

  const isLight = theme === 'light';
  const isCosmic = theme === 'cosmic';

  // Parse order: Inline Code, Inline Math, Bold, Italic, Links, Spans
  const parts: React.ReactNode[] = [];
  let key = 0;
  
  // Custom regex parsing for:
  // - ins: <ins>text</ins>
  // - del: <del>text</del>
  // - code: `code`
  // - math: $math$
  // - bold: **text**
  // - italic: *text* or _text_
  // - link: [label](url)
  
  const tokenRegex = /(<ins>[\s\S]*?<\/ins>|<del>[\s\S]*?<\/del>|`[^`]+`|\$\d+([.,]\d+)?\$|\$[^\$]+\$|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  
  const segments = text.split(tokenRegex);
  
  for (const segment of segments) {
    if (!segment) continue;

    if (segment.startsWith('<ins>') && segment.endsWith('</ins>')) {
      const content = segment.slice(5, -6);
      parts.push(
        <ins key={key++} className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 no-underline rounded-sm px-0.5">
          {renderInline(content, theme)}
        </ins>
      );
    } else if (segment.startsWith('<del>') && segment.endsWith('</del>')) {
      const content = segment.slice(5, -6);
      parts.push(
        <del key={key++} className="bg-red-50 dark:bg-red-900/20 text-red-500/80 dark:text-red-400/80 rounded-sm px-0.5">
          {renderInline(content, theme)}
        </del>
      );
    } else if (segment.startsWith('`') && segment.endsWith('`')) {
      parts.push(
        <code 
          key={key++} 
          className={`px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[13px] border ${
            isLight 
              ? "bg-[#f1f1f1]/80 text-[#222222] border-gray-100" 
              : isCosmic 
                ? "bg-indigo-950/60 text-indigo-200 border-indigo-500/20" 
                : "bg-neutral-800 text-neutral-200 border-neutral-700/50"
          }`}
        >
          {segment.slice(1, -1)}
        </code>
      );
    } else if (segment.startsWith('$') && segment.endsWith('$')) {
      // Inline Math
      parts.push(
        <code 
          key={key++} 
          className={`px-1.5 py-0.5 rounded-md font-mono text-[13px] border ${
            isLight 
              ? "bg-[#fafafa] text-[#111111] border-gray-50/50" 
              : isCosmic 
                ? "bg-indigo-950/60 text-indigo-200 border-indigo-500/20" 
                : "bg-neutral-800 text-neutral-200 border-neutral-700/50"
          }`}
        >
          {segment.slice(1, -1)}
        </code>
      );
    } else if (segment.startsWith('**') && segment.endsWith('**')) {
      parts.push(
        <strong 
          key={key++} 
          className={`font-semibold tracking-tight font-sans ${
            isLight ? "text-neutral-900" : "text-white"
          }`}
        >
          {segment.slice(2, -2)}
        </strong>
      );
    } else if ((segment.startsWith('*') && segment.endsWith('*')) || (segment.startsWith('_') && segment.endsWith('_'))) {
      parts.push(
        <em 
          key={key++} 
          className={`italic ${
            isLight 
              ? "text-neutral-800" 
              : isCosmic 
                ? "text-indigo-100/90" 
                : "text-neutral-200"
          }`}
        >
          {segment.slice(1, -1)}
        </em>
      );
    } else if (segment.startsWith('[') && segment.includes('](')) {
      const match = segment.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        parts.push(
          <a
            key={key++}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-semibold underline underline-offset-4 transition-colors ${
              isLight 
                ? "text-neutral-900 decoration-neutral-300 hover:decoration-black" 
                : isCosmic 
                  ? "text-indigo-400 decoration-indigo-400/30 hover:text-indigo-300 hover:decoration-indigo-300" 
                  : "text-neutral-200 decoration-neutral-700 hover:text-white hover:decoration-white"
            }`}
          >
            {match[1]}
          </a>
        );
      } else {
        parts.push(segment);
      }
    } else {
      parts.push(segment);
    }
  }

  return parts;
}
