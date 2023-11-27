import React from "react";
import nodes from "../markdoc/nodes.js";
import tags from "../markdoc/tags.js";
import MD from "@markdoc/markdoc";
import { Config } from "@markdoc/markdoc";

const config: Config = {
    nodes,
    //@ts-expect-error
    tags,
};

export const Markdoc: React.FC<{ rich?: boolean, content: string }> = ({ content, rich }) => {
    const ast = MD.parse(content);
    const transformed = MD.transform(ast, rich ? config : {});
    return MD.renderers.react(transformed, React);
};
