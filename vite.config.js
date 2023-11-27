/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { resolve } from "path"
import { defineConfig } from "vite"
// import heliosPlugin from './lib/HeliosLoader.ts';
import { string } from "rollup-plugin-string"

export default defineConfig({
    plugins: [
        string({
            // Required to be specified
            include: "**/*.hl",
        }),
    ],
    test: {
        // include: ['tests/new*.test.ts', ],
        include: ["tests/*.test.ts", "tests/*.test.js"],
        restoreMocks: true,
        testTimeout: 500000,
        hookTimeout: 7000,
        teardownTimeout: 9000,
        // browser: {
        //     enabled: true,
        //     name: 'chrome', // browser name is required
        //   },
    },

    // build: {
    //     target: ["node", "esnext"],
    //     sourcemap: true,
    //     sourcemapIgnoreList: false,

    //     lib: {
    //         // Could also be a dictionary or array of multiple entry points
    //         entry: resolve(__dirname, "lib/index.ts"),
    //         name: "stellar-contracts",
    //         // the proper extensions will be added
    //         fileName: "stellar-contracts",
    //     },
    // },
})
