import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
    vi,
    assertType,
    expectTypeOf,
} from "vitest";

import {
    DefaultCapo,
    StellarTxnContext,
    dumpAny,
    type TxInput,
    helios,
    utxosAsString,
    byteArrayAsString,
} from "@donecollectively/stellar-contracts";

import {
    ADA,
    type StellarTestContext,
    addTestContext,
    DefaultCapoTestHelper,
} from "@donecollectively/stellar-contracts";
import { CMDBCapoTestHelper } from "./CMDBCapoTestHelper.js";

type localTC = StellarTestContext<CMDBCapoTestHelper>;

const it = itWithContext<localTC>;
const fit = it.only;
const xit = it.skip; //!!! todo: update this when vitest can have skip<HeliosTestingContext>
//!!! until then, we need to use if(0) it(...) : (
// ... or something we make up that's nicer

const describe = descrWithContext<localTC>;

const testPageContent = {
    entryType: "pg",
    title: "collaborator page",
    content: "## Page Heading\n\nPage content here, minimum 40 bytes",
};
const testSuggestedPage = {
    ...testPageContent,
    entryType: "spg",
};

describe("Capo", async () => {
    beforeEach<localTC>(async (context) => {
        // await new Promise(res => setTimeout(res, 10));
        await addTestContext(context, CMDBCapoTestHelper);
    });
    describe("dAPI functions", () => {
        it("findUserRoleInfo(): identifies a user-role for editor only if the current user holds the capoGov in their wallet", async (context: localTC) => {
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

    describe("issues collab tokens for contributors", () => {
        it("issues collab to any address on authority of the editor", async (context: localTC) => {
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
        it("lists created pages", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            const book = await h.bootstrap();

            await h.editorInvitesCollaborator(actors.editor);
            await h.collaboratorCreatesPage(testPageContent);
            await h.collaboratorCreatesPage({
                ...testPageContent,
                title: "test title 2",
            });
            const entries = h.book.findBookEntries();
            await expect(entries).resolves.toHaveLength(2);
        });
        // after change-suggestion creations work
        it.todo("doesn't return change-suggestions as top-level entries");
        it.todo("includes suggested-changes for every page");
    });

    describe("roles and activities", () => {
        describe("page creation: ", () => {
            it("the editor can directly create a page", async (context: localTC) => {
                context.initHelper({ skipSetup: true });
                const {
                    h,
                    h: { network, actors, delay, state },
                } = context;
                const book = await h.bootstrap();

                await h.editorInvitesCollaborator(actors.editor);
                const { content: expectedContent } = testPageContent;
                const { resourceId } = await h.collaboratorCreatesPage(
                    testPageContent
                );

                const onChainEntry = await book.findBookEntry(resourceId);
                expect(onChainEntry.entry.content).toBe(expectedContent);
                expect(onChainEntry.entry.entryType).toBe("pg");
            });

            it("a collaborator can only make a suggested page", async (context: localTC) => {
                context.initHelper({ skipSetup: true });
                const {
                    h,
                    h: { network, actors, delay, state },
                } = context;
                let book = await h.bootstrap();
                const { camilla } = actors;

                await h.editorInvitesCollaborator(actors.camilla);
                h.currentActor = "camilla";
                book = h.strella;

                // const camillaAccount : TxInput[] = (await camilla.utxos);
                // // const camillaAccount = (await network.getUtxos(camilla.address));
                // console.log("looking for tokens in ", dumpAny(book.mph));
                // console.log("camilla's account: ", dumpAny(camillaAccount));

                // function getTokenNames(utxo: TxInput) : string[] {
                //     return utxo.value.assets.getTokenNames(book.mph).map(byteArrayAsString)
                // }
                // const camillaHasCoins = camillaAccount.find((txo: TxInput) => {
                //     // console.log("   :eye:   ", dumpAny(txo));
                //     const tokenNames = getTokenNames(txo);

                //     // console.log(tokenNames , "is length", tokenNames.length);
                //     return !!( tokenNames.length > 0 )
                // });
                // expect (camillaHasCoins).toBeTruthy();
                // const camillaTokenNames = getTokenNames(camillaHasCoins);
                // expect(camillaTokenNames.length).toBe(1);
                // expect(camillaTokenNames[0]).toMatch(/^collab-/);

                const pageCreation = h.collaboratorCreatesPage(testPageContent);
                await expect(pageCreation).rejects.toThrow(
                    /missing delegation token.*capoGov/
                );

                const { content: expectedContent } = testSuggestedPage;
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const onChainEntry = await book.findBookEntry(resourceId);

                expect(onChainEntry.entry.content).toBe(expectedContent);
                expect(onChainEntry.entry.entryType).toBe("spg");
            });
        });

        describe("modifying page content: ", () => {
            it("editor can edit a suggested page and upgrade it to type=pg", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.editorInvitesCollaborator(actors.camilla);
                h.currentActor = "camilla";
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                h.currentActor = "editor";

                const onChainEntry = await h.book.findBookEntry(resourceId);
                const { entry } = onChainEntry;

                await h.editorModifiesPage(onChainEntry, {
                    ...entry,
                    content: entry.content + "\n\nEditor updated",
                    entryType: "pg",
                });
            });

            it("random collaborator can't apply changes directly", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.bootstrap(); 
                await h.editorInvitesCollaborator(actors.camilla);
                await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "camilla"
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                h.currentActor = "charlie";
                const existingPage = await h.book.findBookEntry(resourceId);
                const randoCantUpdate = h.collaboratorModifiesPage(existingPage, {
                    ...existingPage.entry,
                    title: testPageContent.title + " - rando can't update this"
                });
                await randoCantUpdate
                await expect(randoCantUpdate).rejects.toThrow(/no way rando/)
            
            });
            
            it("page owner can directly apply updates", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.bootstrap(); 
                
            
            });
        });

        describe("suggesting", () => {
            it.todo("a collaborator can make a suggestion on someone else's page", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();
            });

            it.todo("suggestions are only through a collaborator role, not the editor role", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();
            });
    
            
        });

        it.todo("a page owner can adopt a suggestion", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            const book = await h.bootstrap();
        });
    });
});
