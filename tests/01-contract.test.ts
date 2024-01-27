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

const testPageEntry: BookEntryCreationAttrs = {
    entryType: "pg",
    title: "collaborator page",
    content: "## Page Heading\n\nPage content here, minimum 40 bytes\n\n",
};
const testSuggestedPage: BookEntryCreationAttrs = {
    ...testPageEntry,
    entryType: "spg",
};

describe("Capo", async () => {
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

    describe("roles and activities", () => {
        describe("page creation: ", () => {
            it("the editor can directly create book pages, with entryType='pg'", async (context: localTC) => {
                context.initHelper({ skipSetup: true });
                const {
                    h,
                    h: { network, actors, delay, state },
                } = context;
                const book = await h.bootstrap();

                await h.editorInvitesCollaborator(actors.editor);
                const { content: expectedContent } = testPageEntry;
                const { resourceId } = await h.collaboratorCreatesPage(
                    testPageEntry
                );

                const onChainEntry = (await book.findBookEntry(resourceId))!

                expect(onChainEntry.entry.content).toBe(expectedContent);
                expect(onChainEntry.entry.entryType).toBe("pg");

                // c8br02x
                const foundCollabToken = await book.findUserRoleInfo("collab");
                if (!foundCollabToken) throw new Error("no collab token");
                expect(foundCollabToken.uut.purpose).toBe("collab");
                expect(onChainEntry.ownerAuthority.uutName).toEqual(
                    foundCollabToken.uut.name
                );
            });

            it("an editor's created pages are owned by their collaborator role, not the capoGov- token", async (context: localTC) => {
                console.log("tested at c8br02x");
            });
        
            it("a collaborator can only create a SUGGESTED page, with entryType='spg'", async (context: localTC) => {
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

                const pageCreation = h.collaboratorCreatesPage(testPageEntry);
                await expect(pageCreation).rejects.toThrow(
                    /trace: 8rf2o3j4/
                );
                await expect(pageCreation).rejects.toThrow(
                    /missing.*delegat.*capoGov/
                );

                const { content: expectedContent } = testSuggestedPage;
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const onChainEntry = (await book.findBookEntry(resourceId))!;

                expect(onChainEntry.entry.content).toBe(expectedContent);
                expect(onChainEntry.entry.entryType).toBe("spg");

                // 2jo8c7b
                const foundCollabToken = await book.findUserRoleInfo("collab");
                if (!foundCollabToken) throw new Error("no collab token");
                expect(onChainEntry.ownerAuthority.uutName).toEqual(
                    foundCollabToken.uut.name
                );
            });
            it("the suggestor's collaborator token is referenced as the SUGGESTED page's ownerAuthority", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;

                console.log("tested at 2jo8c7b");
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
                const camillaCollabToken = await h.book.findUserRoleInfo(
                    "collab"
                );
                if (!camillaCollabToken) throw new Error("no camillaCollabToken");

                h.currentActor = "editor";
                const editorUut = ( await h.book.findUserRoleInfo("collab") )!.uut;
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
                    const fresherOnChainEntry = await h.book.findBookEntry(resourceId);
                    if (!fresherOnChainEntry) throw new Error("no onChainEntry");
                    const { entry } = fresherOnChainEntry;

                    await h.editorModifiesPage(fresherOnChainEntry, {
                        ...entry,
                        content: entry.content + "\n\nEditor updated content",
                    });
                    const freshestPage = await h.book.findBookEntry(resourceId);
                    if (!freshestPage) throw new Error("no updatedPage");
                    expect(freshestPage.entry.entryType).toEqual("pg");
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
                const editorUut = ( await h.book.findUserRoleInfo("collab") )!.uut;

                const onChainEntry = await h.book.findBookEntry(resourceId);
                if (!onChainEntry) throw new Error("no onChainEntry");
                const { entry } = onChainEntry;

                await h.editorModifiesPage(onChainEntry, {
                    ...entry,
                    content: entry.content + "\n\nEditor updated content",
                });
                const updatedPage = await h.book.findBookEntry(resourceId);
                expect(updatedPage).toBeTruthy();

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
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const existingPage = await h.book.findBookEntry(resourceId);
                if (!existingPage) throw new Error("no existingPage");

                const updates = {
                    ...existingPage.entry,
                    content:
                        testPageEntry.content + "\n\nOwner updated content",
                    title: testPageEntry.title + " - owner-did-update",
                };
                await h.collaboratorModifiesPage(existingPage, updates);

                const updatedPage = await h.book.findBookEntry(resourceId);
                if (!updatedPage) throw new Error("no updatedPage");
                console.log("     🐞 updated page", updatedPage.entry.title);
                expect(updatedPage.entry.title).toMatch(/owner-did-update/);
                expect(updatedPage.entry.content).toMatch(/updated content/);
            });

            it("the owner of a SUGGESTED page can directly apply updates", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                await h.bootstrap();
                await h.editorInvitesCollaborator(actors.camilla);
                h.currentActor = "camilla";
                const { resourceId } = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const existingPage = await h.book.findBookEntry(resourceId);
                if (!existingPage) throw new Error("no existingPage");
                const updates = {
                    ...existingPage.entry,
                    content:
                        testPageEntry.content + "\n\nOwner updated content",
                    title: testPageEntry.title + " - owner-did-update",
                };
                await h.collaboratorModifiesPage(existingPage, updates);

                const updatedPage = await h.book.findBookEntry(resourceId);
                if (!updatedPage) throw new Error("no updatedPage");
                console.log("     🐞 updated page", updatedPage.entry.title);
                expect(updatedPage.entry.title).toMatch(/owner-did-update/);
                expect(updatedPage.entry.content).toMatch(
                    /Owner updated content/
                );
            });
        });

        describe("suggesting changes: ", () => {
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
                const newPage = await h.book.findBookEntry(pageId);
                if (!newPage) throw new Error("no newPage");
                return [resourceUpdated,  newPage];
            }

            it("a collaborator token is required to suggest changes", async (context: localTC) => {
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
                    title: testPageEntry.title + " - collaborator suggestion",
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
                    /missing.*delegation token/
                );
                expect(hasFakeRoleInfo).toHaveBeenCalled();
                expect(mockedUserToken).toHaveBeenCalled();
            });

            it("a collaborator can suggest page changes, with entryType='sug' for Suggestion", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const [pageInfo, page] = await setup(context);

                await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "charlie";

                const updates = {
                    ...page.entry,
                    content:
                        testPageEntry.content +
                        "\n\nCollaborator updated content",
                    title: testPageEntry.title + " - collaborator suggestion",
                };
                const {
                    resourceId: suggestionId,
                    tcx,
                    txid,
                } = await h.collaboratorSuggestsChange(page, updates);

                const newSuggestion = await h.book.findBookEntry(suggestionId);
                if (!newSuggestion) throw new Error("no newSuggestion");
                expect(newSuggestion.entry.content).toMatch(
                    /Collaborator updated content/
                );
                expect(newSuggestion.entry.entryType).toEqual("sug");
                expect(newSuggestion.entry.title).toMatch(
                    /collaborator suggestion/
                );

                const { uut: charlieToken } = (await h.book.findUserRoleInfo(
                    "collab"
                ))!

                // h642bx
                expect(newSuggestion.ownerAuthority.uutName).toEqual(
                    charlieToken.name
                );
            });

            it("the suggestor's collaborator token is referenced as the Change record's ownerAuthority", () => {
                console.log("already tested at h642bx");
            });

            it("an editor's suggestions are owned by their collaborator role", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;

                const [pageInfo, page] = await setup(context);
                await h.editorInvitesCollaborator(actors.editor);
                h.currentActor = "editor";

                const updates = {
                    ...page.entry,
                    content:
                        testPageEntry.content + "\n\nEditor content suggestion",
                    title: testPageEntry.title + " - editor suggestion",
                };
                const {
                    resourceId: suggestionId,
                    tcx,
                    txid,
                } = await h.collaboratorSuggestsChange(page, updates);

                const newSuggestion = await h.book.findBookEntry(suggestionId);
                if (!newSuggestion) throw new Error("no newSuggestion");
                expect(newSuggestion.entry.content).toMatch(
                    /Editor content suggestion/
                );
                expect(newSuggestion.entry.entryType).toEqual("sug");
                expect(newSuggestion.entry.title).toMatch(/editor suggestion/);

                const { uut: editorCollab } = (await h.book.findUserRoleInfo(
                    "collab"
                ))!;

                expect(newSuggestion.ownerAuthority.uutName).toEqual(
                    editorCollab.name
                );
            });

            it.todo(
                "TODO: the suggestor can adjust the Change record before it is accepted",
                async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;

                    // const strella =
                    await h.bootstrap();

                    //!!! note: it could be tricky to recognize edits that are WITHIN the change-suggestion.
                }
            );

            it.todo(
                "TODO: other collaborators can suggest alternatives to a change suggestion"
            );

            describe("well specified data format for change suggestions", () => {
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
                            testPageEntry.title + " - collaborator suggestion",
                    };
                    const {
                        resourceId: suggestionId,
                        tcx,
                        txid,
                    } = await h.collaboratorSuggestsChange(page, updates);
                    const newSuggestion = (await h.book.findBookEntry(
                        suggestionId
                    ))!;

                    const { title, content, changeParentTxId } =
                        newSuggestion.entry;
                    expect(
                        changeParentTxId!.eq(pageTxId),
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
                    ).rejects.toThrow(/no ref_input matching changeParentTxId/);
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

                    const { title, content } = newSuggestion!.entry;
                    expect(title).toEqual(altTitle);
                    expect(
                        content.length,
                        "expected empty content"
                    ).toBeFalsy();
                });

                it("formats content changes as a diff, leaving title empty if unchanged", async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;

                    const [pageInfo, page] = await setup(context);
                    const { txid: pageTxId } = pageInfo;
                    await h.editorInvitesCollaborator(actors.charlie);
                    h.currentActor = "charlie";

                    const updatedContent =
                        testPageEntry.content +
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

                    const { title, content: contentDiff } = newSuggestion!.entry;
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
        });
        describe("accepting change suggestions: ", () => {
            async function setup(
                context: localTC,
                addContent: string = "Collaborator suggested update",
                newTitle: string = ""
            ): Promise<
                [
                    // returns the page-creation txn details, the page record,
                    ResourceUpdateResult<any>,
                    BookEntryForUpdate,

                    // the suggestion txn details, and the suggestion record
                    ResourceUpdateResult<any>,
                    BookEntryForUpdate
                ]
            > {
                const {
                    h,
                    h: { network, actors, delay, state },
                } = context;

                await h.bootstrap();
                await h.editorInvitesCollaborator(actors.camilla);
                // await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "camilla";
                const pageCreated = await h.collaboratorCreatesPage(
                    testSuggestedPage
                );
                const { resourceId: pageId } = pageCreated;
                const page = await h.book.findBookEntry(pageId);
                if (!page) throw new Error("no page created");

                await h.editorInvitesCollaborator(actors.charlie);
                h.currentActor = "charlie";

                const updates = {
                    ...page.entry,
                    content: testPageEntry.content + addContent,
                };
                if (newTitle) updates.title = newTitle;

                const suggestedUpdate = await h.collaboratorSuggestsChange(
                    page,
                    updates
                );
                debugger
                const { resourceId: suggestionId, tcx, txid } = suggestedUpdate;
                const suggestion = await h.book.findBookEntry(suggestionId);

                return [pageCreated, page, suggestedUpdate, suggestion!];
            }

            it("a page owner can adopt a suggestion", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();
                //prettier-ignore
                const [
                    pageCreated, page, 
                    suggestedUpdate, suggestion
                ] = await setup(context);

                const { resourceId: pageId } = pageCreated;
                const { resourceId: suggestionId } = suggestedUpdate;

                h.currentActor = "camilla";
                await h.acceptSuggestions(page, [suggestion]);
                const updated = await h.book.findBookEntry(pageId);
                expect(updated).toBeTruthy();
                expect (updated!.entry.content).toMatch(/Page content here/);
                expect (updated!.entry.content).toMatch(/Collaborator suggested update/);
            });

            it.todo("TODO: can adopt multiple suggestions that don't conflict", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                
                  // const strella = 
                await h.bootstrap(); 
                            
            });

            it.todo("TODO: can adopt conflicting sugestions, with a provided resolution", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                
                  // const strella = 
                await h.bootstrap(); 
                            
            })

            it("editor can accept suggestions", async (context: localTC ) => { 
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                const book = await h.bootstrap();
                //prettier-ignore
                const [
                    pageCreated, page, 
                    suggestedUpdate, suggestion
                ] = await setup(context);

                const { resourceId: pageId } = pageCreated;
                const { resourceId: suggestionId } = suggestedUpdate;

                await h.editorInvitesCollaborator(actors.editor);
                h.currentActor = "editor";
                const editorUut = ( await h.book.findUserRoleInfo("collab") )!.uut;
                await h.acceptSuggestions(page, [suggestion]);

                const updated = await h.book.findBookEntry(pageId);
                expect(updated).toBeTruthy();
                expect (updated!.entry.content).toMatch(/Page content here/);
                expect (updated!.entry.content).toMatch(/Collaborator suggested update/);
            });

            it("a random collaborator can't accept a suggested change", async (context: localTC) => {
                // prettier-ignore
                const {h, h:{network, actors, delay, state} } = context;
                
                  // const strella = 
                await h.bootstrap(); 
                //prettier-ignore
                const [
                    pageCreated, page, 
                    suggestedUpdate, suggestion
                ] = await setup(context);

                const { resourceId: pageId } = pageCreated;
                const {
                    ownerAuthority: {
                        uutName: ownerTokenName
                    }
                } = page;
                const { resourceId: suggestionId } = suggestedUpdate;

                await h.editorInvitesCollaborator(actors.ralph);
                h.currentActor = "ralph";
                const offChain = h.acceptSuggestions(page, [suggestion]);
                await expect(offChain).rejects.toThrow(
                    /wallet doesn't have.*authority/
                );

                vi.spyOn(h.book, "userHasOwnership").mockReturnValue(true);
                const onChain = h.acceptSuggestions(page, [suggestion])
                await expect(onChain).rejects.toThrow(
                    new RegExp(`owner ${ownerTokenName} missing`)
                );
                await expect(onChain).rejects.toThrow(
                    /missing.*delegation token/
                );
            });
            it.todo(
                "TODO: when accepted, the change originator receives the suggestion's minUtxo"
            );
            it.todo("TODO: when accepted, its eid-* UUT is burned.");
            it.todo("TODO: when NOT accepting changes, the mint-delegate's AcceptingPageChanges activity fails");
        });

        describe("rejecting changes", () => {
            it.todo(
                "TODO: a random collaborator can't reject a suggested change"
            );
            it.todo("TODO: editor can reject a suggested change");
            it.todo("TODO: page owner can reject a suggested change");
            it.todo(
                "TODO: when a change is rejected, its eid-* UUT is burned."
            );
            it.todo("TODO: when NOT rejecting changes, the mint-delegate's RejectingPageChanges activity fails");
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
            it.todo(
                "TODO: editor can delete a page",
                async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;
                    const book = await h.bootstrap();

                    await h.editorInvitesCollaborator(actors.camilla);
                    h.currentActor = "camilla";
                    const { resourceId } = await h.collaboratorCreatesPage(
                        testPageEntry
                    );
                    const existingPage = await h.book.findBookEntry(resourceId);

                    await h.editorDeletesPage(existingPage);
                    const deletedPage = await h.book.findBookEntry(resourceId);
                    expect(deletedPage).toBeUndefined();
                }
            );

            it.todo(
                "TODO: collaborator can't delete a page",
                async (context: localTC) => {
                    // prettier-ignore
                    const {h, h:{network, actors, delay, state} } = context;
                    const book = await h.bootstrap();

                    await h.editorInvitesCollaborator(actors.camilla);
                    h.currentActor = "camilla";
                    const { resourceId } = await h.collaboratorCreatesPage(
                        testPageEntry
                    );
                    const existingPage = await h.book.findBookEntry(resourceId);

                    h.currentActor = "camilla";
                    const offChainFailure =
                        h.collaboratorDeletesPage(existingPage);
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
                    const randoCantDelete =
                        h.collaboratorDeletesPage(existingPage);
                    await expect(randoCantDelete).rejects.toThrow(
                        /missing delegation token/
                    );
                    expect(hasFakeOwnership).toHaveBeenCalled();
                }
            );
        });
    });
});
