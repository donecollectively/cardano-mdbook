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
    describe("modifying page content: ", () => {
        it("editor can upgrade a suggested page to type=pg", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            await h.editorInvitesCollaborator(actors.editor);
            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            const { resourceId } = await h.collaboratorCreatesPage(
                testSuggestedPage
            );
            const camillaCollabToken = await h.book.findUserRoleInfo("collab");
            if (!camillaCollabToken) throw new Error("no camillaCollabToken");

            h.currentActor = "editor";
            const editorUut = (await h.book.findUserRoleInfo("collab"))!.uut;
            const onChainEntry = await h.book.findBookEntry(resourceId);
            if (!onChainEntry) throw new Error("no onChainEntry");
            const { entry } = onChainEntry;

            await h.editorModifiesPage(onChainEntry, {
                ...entry,
                entryType: "pg",
            });
            const updatedPage = await h.book.findBookEntry(resourceId);
            if (!updatedPage) throw new Error("no updatedPage");
            expect(updatedPage.entry.entryType).toEqual("pg");
            expect(updatedPage.ownerAuthority.uutName).toEqual(
                camillaCollabToken.uut.name
            );

            {
                // d9msju4
                const fresherOnChainEntry = await h.book.findBookEntry(
                    resourceId
                );
                if (!fresherOnChainEntry) throw new Error("no onChainEntry");
                const { entry } = fresherOnChainEntry;

                await h.editorModifiesPage(fresherOnChainEntry, {
                    ...entry,
                    content: entry.content + "\n\nEditor updated content",
                });
                const freshestPage = await h.book.findBookEntry(resourceId);
                if (!freshestPage) throw new Error("no updatedPage");
                expect(freshestPage.entry.entryType).toEqual("pg");
                expect(freshestPage.entry.updatedBy).toEqual(editorUut.name);
                expect(freshestPage.ownerAuthority.uutName).toEqual(
                    camillaCollabToken.uut.name
                );
                expect(freshestPage.entry.content).toMatch(
                    /Editor updated content/
                );
            }
        });

        it("editor can make changes to another collaborator's page", async (context: localTC) => {
            console.log("tested with d9msju4");
        });

        it("editor can make changes to a suggested page without changing its type", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            await h.editorInvitesCollaborator(actors.editor);
            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            const { resourceId } = await h.collaboratorCreatesPage(
                testSuggestedPage
            );
            h.currentActor = "editor";
            const editorUut = (await h.book.findUserRoleInfo("collab"))!.uut;

            const onChainEntry = await h.book.findBookEntry(resourceId);
            if (!onChainEntry) throw new Error("no onChainEntry");
            const { entry } = onChainEntry;

            await h.editorModifiesPage(onChainEntry, {
                ...entry,
                content: entry.content + "\n\nEditor updated content",
            });
            const updatedPage = await h.book.findBookEntry(resourceId);
            expect(updatedPage).toBeTruthy();
            expect(updatedPage!.entry.updatedBy).toEqual(editorUut.name);

            expect(updatedPage!.entry.content).toMatch(
                /Editor updated content/
            );
        });

        it("random collaborator can't apply changes directly to a page", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            await h.bootstrap();
            await h.editorInvitesCollaborator(actors.camilla);
            await h.editorInvitesCollaborator(actors.charlie);
            h.currentActor = "camilla";
            const { resourceId } = await h.collaboratorCreatesPage(
                testSuggestedPage
            );
            h.currentActor = "charlie";
            const existingPage = await h.book.findBookEntry(resourceId);
            if (!existingPage) throw new Error("no existingPage");

            const updates = {
                ...existingPage.entry,
                title: testPageEntry.title + " - rando can't update this",
            };
            const offChainFailure = h.collaboratorModifiesPage(
                existingPage,
                updates
            );
            // fails before we even try to post a transaction on-chain
            await expect(offChainFailure).rejects.toThrow(
                /connected wallet.*authority/
            );

            const hasFakeOwnership = vi
                .spyOn(h.book, "userHasOwnership")
                .mockReturnValue(true);
            const randoCantUpdate = h.collaboratorModifiesPage(
                existingPage,
                updates
            );
            // on-chain contract fails without the page's delegation token
            await expect(randoCantUpdate).rejects.toThrow(
                /no collab.*editor-authority/
            );
            expect(hasFakeOwnership).toHaveBeenCalled();
        });

        it("page owner can directly apply changes to their owned page", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            await h.bootstrap();
            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            const { resourceId, tcx } = await h.collaboratorCreatesPage(
                testSuggestedPage
            );
            const existingPage = await h.book.findBookEntry(resourceId);
            if (!existingPage) throw new Error("no existingPage");

            const updates = {
                ...existingPage.entry,
                content: testPageEntry.content + "\n\nOwner updated content",
                title: testPageEntry.title + " - owner-did-update",
            };
            await h.collaboratorModifiesPage(existingPage, updates);

            const ownerUut = tcx.state.uuts.collab;

            const updatedPage = await h.book.findBookEntry(resourceId);
            if (!updatedPage) throw new Error("no updatedPage");
            console.log("     🐞 updated page", updatedPage.entry.title);

            expect(updatedPage!.entry.updatedBy).toEqual(ownerUut.name);
            expect(updatedPage.entry.title).toMatch(/owner-did-update/);
            expect(updatedPage.entry.content).toMatch(/updated content/);
        });

        it("the owner of a SUGGESTED page can directly apply updates", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            await h.bootstrap();
            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            const { resourceId, tcx } = await h.collaboratorCreatesPage(
                testSuggestedPage
            );
            const existingPage = await h.book.findBookEntry(resourceId);
            if (!existingPage) throw new Error("no existingPage");
            const updates = {
                ...existingPage.entry,
                content: testPageEntry.content + "\n\nOwner updated content",
                title: testPageEntry.title + " - owner-did-update",
            };
            await h.collaboratorModifiesPage(existingPage, updates);

            const updatedPage = await h.book.findBookEntry(resourceId);
            if (!updatedPage) throw new Error("no updatedPage");
            console.log("     🐞 updated page", updatedPage.entry.title);

            expect(updatedPage!.entry.updatedBy).toEqual(
                tcx.state.uuts.collab.name
            );
            expect(updatedPage.entry.title).toMatch(/owner-did-update/);
            expect(updatedPage.entry.content).toMatch(/Owner updated content/);
        });
    });
});
