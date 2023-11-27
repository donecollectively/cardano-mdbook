import { Fence } from '@/components/Fence.jsx'
import { nodes as defaultNodes } from '@markdoc/markdoc'
import { Config } from "@markdoc/markdoc";

const nodes : Config["nodes"] = {
  document: {
    render: undefined,
  },
  th: {
    ...defaultNodes.th,
    attributes: {
      ...defaultNodes.th.attributes,
      scope: {
        type: String,
        default: 'col',
      },
    },
  },
  fence: {
    //@ts-expect-error
    render: Fence,
    attributes: {
      language: {
        type: String,
      },
    },
  },
}

export default nodes
