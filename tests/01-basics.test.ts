import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
    vi,
} from "vitest";

import {
    ADA,
    type StellarTestContext,
    addTestContext,
    DefaultCapoTestHelper,
} from "@donecollectively/stellar-contracts";
import {
    CMDBCapoTestHelper,
    ResourceUpdateResult,
} from "./CMDBCapoTestHelper.js";
import {
    BookEntryCreationAttrs,
    BookEntryForUpdate,
    CMDBCapo,
    RoleInfo,
} from "../src/contracts/CMDBCapo.js";
import { applyPatch } from "diff";
import { testPageEntry, testSuggestedPage } from "./testContent.js";

type localTC = StellarTestContext<CMDBCapoTestHelper>;

const it = itWithContext<localTC>;
const fit = it.only;
const xit = it.skip; //!!! todo: update this when vitest can have skip<HeliosTestingContext>
//!!! until then, we need to use if(0) it(...) : (
// ... or something we make up that's nicer

const describe = descrWithContext<localTC>;

describe("CMDB Basics", async () => {
    beforeEach<localTC>(async (context) => {
        // await new Promise(res => setTimeout(res, 10));
        await addTestContext(context, CMDBCapoTestHelper);
    });
    describe("helper functions", () => {
        describe("findUserRoleInfo()", () => {
            it("returns a RoleInfo object or undefined, given a uut prefix", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.bootstrap();

                h.currentActor = "camilla";
                const notEditor = h.book.findUserRoleInfo("capoGov");
                await expect(notEditor).resolves.toBeUndefined();
                h.currentActor = "editor";

                await expect(
                    h.book.findUserRoleInfo("capoGov")
                ).resolves.toMatchObject({
                    utxo: expect.anything(),
                    uut: { purpose: "capoGov", name: /capoGov-.*/ },
                });
            });
        });
    });

    describe("issues collab tokens for contributors", () => {
        it("issues collab-* UUTs to any address on authority of the editor", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            let book = await h.bootstrap();

            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            book = h.strella;
            const foundCollabToken = await book.findUserRoleInfo("collab");
            expect(foundCollabToken).toBeTruthy();
        });
    });

    describe("creates a registry of pages", () => {
        describe("findBookEntry(): ", () => {
            it("finds active entries when used with no arguments", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();

                await h.editorInvitesCollaborator(actors.editor);
                await h.collaboratorCreatesPage(testPageEntry);
                await h.collaboratorCreatesPage({
                    ...testPageEntry,
                    title: "test title 2",
                });
                const entries = h.book.findBookEntries();
                await expect(entries).resolves.toHaveLength(2);
            });

            it.todo(
                "TODO: includes expired entries when used with expired:true"
            );
            it.todo(
                "TODO: includes suggested entries when used with suggested:true"
            );
            it.todo(
                "TODO: doesn't include suggested edits to pages at the top level"
            );
            it.todo(
                "TODO: each record includes any suggested changes that are pending"
            );
        });
    });
});
