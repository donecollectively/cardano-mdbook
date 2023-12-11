import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
    vi,
    assertType,
    expectTypeOf,
    beforeAll,
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

type localTC = StellarTestContext<CMDBCapoTestHelper>;

const it = itWithContext<localTC>;
const fit = it.only;
const xit = it.skip; //!!! todo: update this when vitest can have skip<HeliosTestingContext>
//!!! until then, we need to use if(0) it(...) : (
// ... or something we make up that's nicer

const describe = descrWithContext<localTC>;

const testPageContent: BookEntryCreationAttrs = {
    entryType: "pg",
    title: "collaborator page",
    content: "## Page Heading\n\nPage content here, minimum 40 bytes\n\n",
};
const testSuggestedPage: BookEntryCreationAttrs = {
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

            it("a collaborator can only create a suggested page", async (context: localTC) => {
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
            it("editor can upgrade a suggested page to type=pg", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.editorInvitesCollaborator(actors.editor);
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
                    entryType: "pg",
                });
                const updatedPage = await h.book.findBookEntry(resourceId);
                expect(updatedPage.entry.entryType).toEqual("pg");
            });

            it("editor can edit a suggested page without changing its type", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.editorInvitesCollaborator(actors.editor);
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
                    content: entry.content + "\n\nEditor updated content",
                });
                const updatedPage = await h.book.findBookEntry(resourceId);
                expect(updatedPage.entry.content).toMatch(
                    /Editor updated content/
                );
            });

            it("random collaborator can't apply changes directly", async (context: localTC) => {
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

                const updates = {
                    ...existingPage.entry,
                    title: testPageContent.title + " - rando can't update this",
                };
                const offChainFailure = h.collaboratorModifiesPage(
                    existingPage,
                    updates
                );
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
                await expect(randoCantUpdate).rejects.toThrow(
                    /missing delegation token/
                );
                expect(hasFakeOwnership).toHaveBeenCalled();
            });

            it("page owner can directly apply updates", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.bootstrap();
                await h.editorInvitesCollaborator(actors.camilla);
                h.currentActor = "camilla";
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const existingPage = await h.book.findBookEntry(resourceId);

                const updates = {
                    ...existingPage.entry,
                    title: testPageContent.title + " - owner-did-update",
                };
                await h.collaboratorModifiesPage(existingPage, updates);

                const updatedPage = await h.book.findBookEntry(resourceId);
                console.log("     🐞 updated page", updatedPage.entry.title);
                expect(updatedPage.entry.title).toMatch(/owner-did-update/);
            });
        });

        describe("suggesting", () => {
            async function setup(
                context: localTC
            ): Promise<[ResourceUpdateResult<any>, BookEntryForUpdate]> {
                const {
                    h,
                    h: { network, actors, delay, state },
                } = context;

                await h.bootstrap();
                await h.editorInvitesCollaborator(actors.camilla);
                // await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "camilla";
                const resourceUpdated = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const { resourceId: pageId } = resourceUpdated;
                const page = await h.book.findBookEntry(pageId);
                return [resourceUpdated, page];
            }

            it("collaborator token is required to suggest changes", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const [pageInfo, page] = await setup(context);

                await h.editorInvitesCollaborator(actors.camilla);
                h.currentActor = "camilla";
                const camillaCollabToken = await h.book.findUserRoleInfo(
                    "collab"
                );

                // await h.editorInvitesCollaborator(actors.charlie);  // no invite for you!
                h.currentActor = "charlie";
                const updates = {
                    ...page.entry,
                    title: testPageContent.title + " - collaborator suggestion",
                };
                const offChainFailure = h.collaboratorSuggestsChange(
                    page,
                    updates
                );
                await expect(offChainFailure).rejects.toThrow(
                    /doesn't have a collab.*token/
                );

                const hasFakeRoleInfo = vi
                    .spyOn(h.book, "findUserRoleInfo")
                    .mockResolvedValue(camillaCollabToken);

                const mockedUserToken = vi
                    .spyOn(h.book, "txnAddUserToken")
                    .mockImplementation(async (tcx, x) => tcx);

                const randoCantSuggest = h.collaboratorSuggestsChange(
                    page,
                    updates
                );
                // await randoCantSuggest;
                await expect(randoCantSuggest).rejects.toThrow(
                    /missing delegation token/
                );
                expect(hasFakeRoleInfo).toHaveBeenCalled();
                expect(mockedUserToken).toHaveBeenCalled();
            });

            it("a collaborator can make a suggestion on someone else's page", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const [pageInfo, page] = await setup(context);

                await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "charlie";

                const updates = {
                    ...page.entry,
                    title: testPageContent.title + " - collaborator suggestion",
                };
                const {
                    resourceId: suggestionId,
                    tcx,
                    txid,
                } = await h.collaboratorSuggestsChange(page, updates);

                const newSuggestion = await h.book.findBookEntry(suggestionId);
                const { uut: charlieToken } = await h.book.findUserRoleInfo(
                    "collab"
                );
                expect(newSuggestion.ownerAuthority.uutName).toEqual(
                    charlieToken.name
                );
            });

            describe("- data format", () => {
                it("references the parent transaction-id", async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;

                    const [pageInfo, page] = await setup(context);
                    const { txid: pageTxId } = pageInfo;
                    await h.editorInvitesCollaborator(actors.charlie);
                    h.currentActor = "charlie";

                    const updates = {
                        ...page.entry,
                        title:
                            testPageContent.title +
                            " - collaborator suggestion",
                    };
                    const {
                        resourceId: suggestionId,
                        tcx,
                        txid,
                    } = await h.collaboratorSuggestsChange(page, updates);
                    const newSuggestion = await h.book.findBookEntry(
                        suggestionId
                    );

                    const { title, content, changeParentTxn } =
                        newSuggestion.entry;
                    expect(
                        changeParentTxn.eq(pageTxId),
                        "mismatched txid"
                    ).toBeTruthy();

                    vi.spyOn(h.book, "txnAddParentRefUtxo").mockImplementation(
                        async (tcx, recId) => tcx
                    );
                    const badSuggestionTxn = h.collaboratorSuggestsChange(
                        page,
                        updates
                    );
                    await expect(
                        badSuggestionTxn,
                        "contract should throw when the txn is built wrong"
                    ).rejects.toThrow(/no ref_input matching changeParentTxn/);
                });

                it("formats title as direct change, leaving content empty if unchanged", async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;

                    const [pageInfo, page] = await setup(context);
                    const { txid: pageTxId } = pageInfo;
                    await h.editorInvitesCollaborator(actors.charlie);
                    h.currentActor = "charlie";

                    const altTitle = "alternative title";
                    const updates = {
                        ...page.entry,
                        title: altTitle,
                    };
                    const {
                        resourceId: suggestionId,
                        tcx,
                        txid,
                    } = await h.collaboratorSuggestsChange(page, updates);
                    const newSuggestion = await h.book.findBookEntry(
                        suggestionId
                    );

                    const { title, content } = newSuggestion.entry;
                    expect(title).toEqual(altTitle);
                    expect(
                        content.length,
                        "expected empty content"
                    ).toBeFalsy();
                });

                it("formats content diff, leaving title empty if unchanged", async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;

                    const [pageInfo, page] = await setup(context);
                    const { txid: pageTxId } = pageInfo;
                    await h.editorInvitesCollaborator(actors.charlie);
                    h.currentActor = "charlie";

                    const updatedContent =
                        testPageContent.content +
                        "\n## Plus collaborator suggestion\n";
                    const updates = {
                        ...page.entry,
                        content: updatedContent,
                    };
                    const {
                        resourceId: suggestionId,
                        tcx,
                        txid,
                    } = await h.collaboratorSuggestsChange(page, updates);
                    const newSuggestion = await h.book.findBookEntry(
                        suggestionId
                    );

                    const { title, content: contentDiff } = newSuggestion.entry;
                    expect(
                        contentDiff.length,
                        "expected content diff"
                    ).toBeTruthy();
                    expect(title.length, "expected empty title").toBeFalsy();

                    const patched = applyPatch(page.entry.content, contentDiff);
                    expect(
                        patched,
                        "applyPatch shouldn't fail with false"
                    ).toEqual(updatedContent);
                });
            });

            it.todo(
                "suggestions are only through a collaborator role, not the editor role",
                async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;
                    const book = await h.bootstrap();

                    await h.editorInvitesCollaborator(actors.camilla);
                    await h.editorInvitesCollaborator(actors.charlie);
                    h.currentActor = "camilla";
                    const { resourceId } = await h.collaboratorCreatesPage(
                        testSuggestedPage
                    );
                    h.currentActor = "editor";
                    const existingPage = await h.book.findBookEntry(resourceId);

                    const updates = {
                        ...existingPage.entry,
                        title:
                            testPageContent.title +
                            " - collaborator suggestion",
                    };
                    const offChainFailure = h.collaboratorSuggestsChange(
                        existingPage,
                        updates
                    );
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
                    const editorCantSuggest = h.collaboratorSuggestsChange(
                        existingPage,
                        updates
                    );
                    await expect(editorCantSuggest).rejects.toThrow(
                        /missing delegation token/
                    );
                    expect(hasFakeOwnership).toHaveBeenCalled();
                }
            );
        });

        it.todo(
            "a page owner can adopt a suggestion",
            async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();
            }
        );
    });
});
