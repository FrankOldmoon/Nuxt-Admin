import { Node, InputRule } from '@tiptap/core'

export default Node.create({
    name: 'codes',
    group: 'block',
    addInputRules() {
        return [
            new InputRule({
                find: /^```$/,
                handler: ({ state, range, commands }) => {
                    commands.deleteRange(range)
                    commands.setCodeBlock({language:'python'})
                },
            })
        ]
    },
})
