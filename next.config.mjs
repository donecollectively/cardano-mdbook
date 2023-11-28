import withMarkdoc from "@markdoc/next.js";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.BASE_PATH) throw new Error(`BASE_PATH environment variable should be set in .env.development`)
if (!process.env.BASE_PATH.startsWith('/')) throw new Error(`BASE_PATH must start with a slash (/)`);
if (process.env.BASE_PATH == '/cardano-mdbook') {
    //!!! developing the Cardano-mdbook infrastructure?
    //   set this environment variable to enable local development.
    if (!process.env.CMDBook) {
        throw new Error(`you need to change your repository name and update .env BASE_PATH to match the repository name. `)
    }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    output: "standalone",
    basePath: process.env.BASE_PATH,
    pageExtensions: ["js", "jsx", "tsx", "md"],
    experimental: {
        scrollRestoration: true,
        esmExternals: "loose",
    },
    images: {
        unoptimized: true,
    },

    webpack: (config, options) => {
        const { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack } =
            options;

        config.resolve.alias = {
            ...config.resolve.alias,
            // your aliases
            "@": path.join(__dirname, 'src/')
        };

        config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            ".js": [".ts", ".tsx", ".jsx", ".js"],
            ".jsx": [".tsx", ".jsx"],
            ".mjs": [".mts", ".mjs"],
            ".cjs": [".cts", ".cjs"],
        };

        config.module.rules.push({
            test: /\.hl/,
            type: "asset/source",
        });

        return config;
    },
};

export default withMarkdoc()(nextConfig);
