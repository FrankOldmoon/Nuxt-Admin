// Tiptap 标准节点类型定义
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
 * Markdown 转 Tiptap JSON 格式（TypeScript 版）
 * 支持：标题、引用、无序/有序列表、分隔线、代码块、段落，
 * 行内：图片、链接、粗体、斜体、删除线、行内代码、硬换行。
 */
export function markdownToTiptap(markdown: string): TiptapNode {
  // 预处理：统一换行符
  const text = markdown.replace(/\r\n/g, '\n').trim();
  if (!text) return { type: 'doc', content: [] };

  // 判断一行是否为块级元素起始
  function isBlockStart(line: string): boolean {
    return /^```/.test(line)
      || /^#{1,6}\s+/.test(line)
      || /^>\s?/.test(line)
      || /^[-*+]\s+/.test(line)
      || /^\d+\.\s+/.test(line)
      || /^---+$/.test(line.trim());
  }

  // 解析行内元素
  function parseInline(str: string): TiptapNode[] {
    const nodes: TiptapNode[] = [];
    let remaining = str;

    // 行内语法正则（优先级从高到低）
    const inlinePatterns: InlinePattern[] = [
      // 图片 ![alt](url "title")
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
      // 链接 [text](url "title")
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
      // 行内代码 `code`
      {
        regex: /^`([^`]+)`/,
        handler: (match) => ({
          type: 'text',
          text: match[1],
          marks: [{ type: 'code' }]
        })
      },
      // 粗斜体 ***text***
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
      // 粗体 **text**
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
      // 粗体 __text__
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
      // 斜体 *text*
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
      // 斜体 _text_
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
      // 删除线 ~~text~~
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
      // 硬换行（行尾两个空格）
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

      // 普通文本
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

  // 解析块级元素
  function parseBlocks(mdText: string): TiptapNode[] {
    const lines = mdText.split('\n');
    const blocks: TiptapNode[] = [];
    let i = 0;
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLang = '';
    let codeFenceLen = 0;

    // 段落：连续非空行各自解析行内语法，行与行之间用 hardBreak 连接
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

      // 代码块处理：支持 3+ 反引号围栏
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

      // 空行跳过
      if (line.trim() === '') {
        i++;
        continue;
      }

      // 分隔线
      if (/^---+$/.test(line.trim())) {
        blocks.push({ type: 'horizontalRule' });
        i++;
        continue;
      }

      // 标题
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

      // 引用块
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

      // 无序列表
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

      // 有序列表
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

      // 普通段落（收集连续非块级非空行）
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

    // 流式期间可能出现未闭合的代码块：把已累积的内容也输出，避免内容丢失
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
