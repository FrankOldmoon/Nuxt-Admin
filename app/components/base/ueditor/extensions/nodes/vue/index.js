import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import VueNodeView from './node-view.vue'

export default Node.create({
  name: 'vue',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      content: '',
      type: 'vue',
      height: { default: null, renderHTML: () => null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="vue"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'vue' }),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(VueNodeView)
  },

  addCommands() {
    return {
      insertVue:
        (type = 'vue', content = '') =>
          ({ chain }) => {
            return chain()
              .insertContent({
                type: 'vue',
                attrs: { content, type },
              })
              .run()
          },
    }
  },

  addInputRules() {
    return [
      // Singular type: ::type content:: inserts the node directly
      new InputRule({
        find: /^::(\w+)\s+(.*?)::$/,
        handler: ({ state, range, match, commands }) => {
          const type = match[1];    // e.g. 'pdf'
          const content = match[2]; // e.g. '12'
          commands.deleteRange(range);
          commands.insertContentAt(range.from, {
            type: 'vue',
            attrs: { content, type },
          });
        },
      }),
    ];
  },

  markdownTokenizer: {
    name: 'vue',
    level: 'block',
    start: src => src.search(/::\w/),
    tokenize: (src, tokens, lexer) => {
      const match = /^::(\w+)\s+(.*?)::$/s.exec(src)  // Note: the s flag makes . match newlines
      if (!match) return undefined

      return {
        type: 'vue',          // Fixed token type
        raw: match[0],
        vueType: match[1],
        text: match[2],
        //tokens: lexer.blockTokens(match[2]),
      }
    },
  },

  parseMarkdown: (token, helpers) => {
    return {
      type: 'vue',
      attrs: {
        type: token.vueType,
        content: token.text,
      },
    }
  },

  renderMarkdown: (node, helpers) => {
    const vueType = node.attrs.type
    const content = node.attrs?.content || ''
    return `::${vueType} ${content}::\n`
  }

})
