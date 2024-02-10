import { BookEntryCreationAttrs } from "../src/contracts/CMDBCapo.js";

export const testPageEntry: BookEntryCreationAttrs = {
    entryType: "pg",
    title: "collaborator page",
    content: "## Page Heading\n\nPage content here, minimum 40 bytes\n\n",
};
export const testSuggestedPage: BookEntryCreationAttrs = {
    ...testPageEntry,
    entryType: "spg",
};
