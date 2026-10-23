// Tiptap standard node type definitions
interface TiptapMark {
  type: string;
  attrs?: Record<string, any>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

interface InlinePattern {
  regex: RegExp;
  handler: (match: RegExpMatchArray) => TiptapNode | TiptapNode[];
}

/**
 * Markdown to Tiptap JSON conversion (TypeScript version)
 * Supports: headings, blockquotes, unordered/ordered lists, horizontal rules, code blocks, paragraphs.
 * Inline: images, links, bold, italic, strikethrough, inline code, hard breaks.
 */
export function markdownToTiptap(markdown: string): TiptapNode {
  // Preprocess: normalize line endings
  const text = markdown.replace(/\r\n/g, '\n').trim();
  if (!text) return { type: 'doc', content: [] };

  // Whether a line starts a block element
  function isBlockStart(line: string): boolean {
    return /^```/.test(line)
      || /^#{1,6}\s+/.test(line)
      || /^>\s?/.test(line)
      || /^[-*+]\s+/.test(line)
      || /^\d+\.\s+/.test(line)
      || /^---+$/.test(line.trim());
  }

  // Parse inline elements
  function parseInline(str: string): TiptapNode[] {
    const nodes: TiptapNode[] = [];
    let remaining = str;

    // Inline syntax patterns (priority from high to low)
    const inlinePatterns: InlinePattern[] = [
      // Image ![alt](url "title")
      {
        regex: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
        handler: (match) => ({
          type: 'image',
          attrs: {
            src: match[2],
            alt: match[1] || '',
            title: match[3] || null
          }
        })
      },
      // Link [text](url "title")
      {
        regex: /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
        handler: (match) => {
          const innerNodes = parseInline(match[1]);
          const linkMark: TiptapMark = {
            type: 'link',
            attrs: { href: match[2], title: match[3] || null }
          };
          return innerNodes.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks ? [...node.marks, linkMark] : [linkMark];
            }
            return node;
          });
        }
      },
      // Inline code `code`
      {
        regex: /^`([^`]+)`/,
        handler: (match) => ({
          type: 'text',
          text: match[1],
          marks: [{ type: 'code' }]
        })
      },
      // Bold italic ***text***
      {
        regex: /^\*\*\*([^*]+)\*\*\*/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'bold' }, { type: 'italic' });
            }
            return node;
          });
        }
      },
      // Bold **text**
      {
        regex: /^\*\*([^*]+)\*\*/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'bold' });
            }
            return node;
          });
        }
      },
      // Bold __text__
      {
        regex: /^__([^_]+)__/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'bold' });
            }
            return node;
          });
        }
      },
      // Italic *text*
      {
        regex: /^\*([^*]+)\*/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'italic' });
            }
            return node;
          });
        }
      },
      // Italic _text_
      {
        regex: /^_([^_]+)_/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'italic' });
            }
            return node;
          });
        }
      },
      // Strikethrough ~~text~~
      {
        regex: /^~~([^~]+)~~/,
        handler: (match) => {
          const inner = parseInline(match[1]);
          return inner.map(node => {
            if (node.type === 'text') {
              node.marks = node.marks || [];
              node.marks.push({ type: 'strike' });
            }
            return node;
          });
        }
      },
      // Hard break (two spaces at end of line)
      {
        regex: /^  $/,
        handler: () => ({ type: 'hardBreak' })
      }
    ];

    while (remaining.length > 0) {
      let matched = false;

      for (const pattern of inlinePatterns) {
        const match = remaining.match(pattern.regex);
        if (match) {
          matched = true;
          const result = pattern.handler(match);
          if (Array.isArray(result)) {
            nodes.push(...result);
          } else {
            nodes.push(result);
          }
          remaining = remaining.slice(match[0].length);
          break;
        }
      }

      // Plain text
      if (!matched) {
        const specialIndex = remaining.search(/[!`*_~\[|]/);
        if (specialIndex === -1) {
          nodes.push({ type: 'text', text: remaining });
          remaining = '';
        } else if (specialIndex === 0) {
          nodes.push({ type: 'text', text: remaining[0] });
          remaining = remaining.slice(1);
        } else {
          nodes.push({ type: 'text', text: remaining.slice(0, specialIndex) });
          remaining = remaining.slice(specialIndex);
        }
      }
    }

    return nodes;
  }

  // Parse block elements
  function parseBlocks(mdText: string): TiptapNode[] {
    const lines = mdText.split('\n');
    const blocks: TiptapNode[] = [];
    let i = 0;
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLang = '';
    let codeFenceLen = 0;

    // Paragraphs: parse inline syntax per consecutive non-empty line; lines are joined with hardBreak
    function parseParaLines(lines: string[]): TiptapNode[] {
      const content: TiptapNode[] = [];
      lines.forEach((ln, idx) => {
        if (idx > 0) content.push({ type: 'hardBreak' });
        content.push(...parseInline(ln));
      });
      return content;
    }

    while (i < lines.length) {
      const line = lines[i];

      // Code block: supports 3+ backtick fences
      const fenceMatch = line.match(/^(`{3,})(\w*)$/);
      if (fenceMatch) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = fenceMatch[2] || '';
          codeFenceLen = fenceMatch[1].length;
          codeContent = [];
          i++;
          continue;
        } else if (fenceMatch[1].length >= codeFenceLen) {
          blocks.push({
            type: 'codeBlock',
            attrs: { language: codeLang },
            content: [{ type: 'text', text: codeContent.join('\n') }]
          });
          inCodeBlock = false;
          codeFenceLen = 0;
          i++;
          continue;
        }
      }

      if (inCodeBlock) {
        codeContent.push(line);
        i++;
        continue;
      }

      // Skip empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        blocks.push({ type: 'horizontalRule' });
        i++;
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          attrs: { level: headingMatch[1].length },
          content: parseInline(headingMatch[2])
        });
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        const quoteLines: string[] = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({
          type: 'blockquote',
          content: parseBlocks(quoteLines.join('\n'))
        });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(line)) {
        const items: TiptapNode[] = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^[-*+]\s+/, '');
          items.push({
            type: 'listItem',
            content: [{ type: 'paragraph', content: parseInline(itemText) }]
          });
          i++;
        }
        blocks.push({ type: 'bulletList', content: items });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(line)) {
        const items: TiptapNode[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^\d+\.\s+/, '');
          items.push({
            type: 'listItem',
            content: [{ type: 'paragraph', content: parseInline(itemText) }]
          });
          i++;
        }
        blocks.push({ type: 'orderedList', content: items });
        continue;
      }

      // Plain paragraphs (collect consecutive non-block, non-empty lines)
      const paraLines: string[] = [];
      while (
        i < lines.length
        && lines[i].trim() !== ''
        && !isBlockStart(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length === 0 && i < lines.length) {
        paraLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'paragraph',
        content: parseParaLines(paraLines)
      });
    }

    // An unclosed code block may occur during streaming: also emit the accumulated content to avoid losing it
    if (inCodeBlock) {
      blocks.push({
        type: 'codeBlock',
        attrs: { language: codeLang },
        content: [{ type: 'text', text: codeContent.join('\n') }]
      });
    }

    return blocks;
  }

  return {
    type: 'doc',
    content: parseBlocks(text)
  };
}
