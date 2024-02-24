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
import { testPageEntry, testSuggestedPage } from "./testContent.js";

type localTC = StellarTestContext<CMDBCapoTestHelper>;

const it = itWithContext<localTC>;
const fit = it.only;
const xit = it.skip; //!!! todo: update this when vitest can have skip<HeliosTestingContext>
//!!! until then, we need to use if(0) it(...) : (
// ... or something we make up that's nicer

const describe = descrWithContext<localTC>;

describe("CMDB Roles & Activities -> ", async () => {
    beforeEach<localTC>(async (context) => {
        // await new Promise(res => setTimeout(res, 10));
        await addTestContext(context, CMDBCapoTestHelper);
    });
    describe("page expiration and freshening", () => {
        it.todo(
            "TODO: A listing can be freshened by its owner or editor, and its expiration date is extended",
            async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;

                // const strella =
                await h.bootstrap();
            }
        );
    });

    describe("deleting pages: ", () => {
        it.todo("TODO: editor can delete a page", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            const book = await h.bootstrap();

            await h.editorInvitesCollaborator(actors.camilla);
            await h.setActor("camilla")
            const { resourceId } = await h.collaboratorCreatesPage(
                testPageEntry
            );
            const existingPage = await h.book.findBookEntry(resourceId);

            await h.editorDeletesPage(existingPage);
            const deletedPage = await h.book.findBookEntry(resourceId);
            expect(deletedPage).toBeUndefined();
        });

        it.todo(
            "TODO: collaborator can't delete a page",
            async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();

                await h.editorInvitesCollaborator(actors.camilla);
                await h.setActor("camilla")
                const { resourceId } = await h.collaboratorCreatesPage(
                    testPageEntry
                );
                const existingPage = await h.book.findBookEntry(resourceId);

                await h.setActor("camilla")

                const offChainFailure = h.collaboratorDeletesPage(existingPage);
                await expect(offChainFailure).rejects.toThrow(
                    /connected wallet.*authority/
                );

                const hasFakeOwnership = vi
                    .spyOn(h.book, "userHasOwnership")
                    .mockImplementation(function (
                        this: CMDBCapo,
                        entryForUpdate,
                        collabInfo: RoleInfo
                    ) {
                        return true;
                    });
                const randoCantDelete = h.collaboratorDeletesPage(existingPage);
                await expect(randoCantDelete).rejects.toThrow(
                    /missing delegation token/
                );
                expect(hasFakeOwnership).toHaveBeenCalled();
            }
        );
    });
});
