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
            return [resourceUpdated, newPage];
        }

        it("a collaborator token is required to suggest changes", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;
            const [pageInfo, page] = await setup(context);

            await h.editorInvitesCollaborator(actors.camilla);
            h.currentActor = "camilla";
            const camillaCollabToken = await h.book.findUserRoleInfo("collab");

            // await h.editorInvitesCollaborator(actors.charlie);  // no invite for you!
            h.currentActor = "charlie";
            const updates = {
                ...page.entry,
                title: testPageEntry.title + " - collaborator suggestion",
            };
            const offChainFailure = h.collaboratorSuggestsChange(page, updates);
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
                /missing.*dgTkn collab-/
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
                    testPageEntry.content + "\n\nCollaborator updated content",
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
            ))!;

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
                // expect(updatedPage!.entry.updatedBy).toEqual(tcx.state.uuts.collab.name);
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
                    title: testPageEntry.title + " - collaborator suggestion",
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
                const newSuggestion = await h.book.findBookEntry(suggestionId);

                const { title, content } = newSuggestion!.entry;
                expect(title).toEqual(altTitle);
                expect(content.length, "expected empty content").toBeFalsy();
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
                const newSuggestion = await h.book.findBookEntry(suggestionId);

                const { title, content: contentDiff } = newSuggestion!.entry;
                console.log("     🐞 contentDiff", contentDiff);
                expect(
                    contentDiff.length,
                    "expected content diff"
                ).toBeTruthy();
                expect(title.length, "expected empty title").toBeFalsy();

                const patched = h.book.applyPatch(
                    contentDiff,
                    page.entry.content
                );
                expect(patched, "applyPatch shouldn't fail with false").toEqual(
                    updatedContent
                );
            });
        });
    });
});
