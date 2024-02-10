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
    describe("accepting change suggestions: ", () => {
        async function setup(
            context: localTC,
            options: {
                updatedContent?: string;
                addContent?: string;
                newTitle?: string;
                initialPageAttrs?: BookEntryCreationAttrs;
            } = {}
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
            const {
                addContent = "Collaborator suggested update",
                newTitle = "",
                initialPageAttrs = testSuggestedPage,
                updatedContent = testPageEntry.content + addContent,
            } = options;

            await h.bootstrap();
            await h.editorInvitesCollaborator(actors.camilla);
            // await h.editorInvitesCollaborator(actors.charlie);
            h.currentActor = "camilla";
            const pageCreated = await h.collaboratorCreatesPage(
                initialPageAttrs
            );
            const { resourceId: pageId } = pageCreated;
            const page = await h.book.findBookEntry(pageId);
            if (!page) throw new Error("no page created");

            await h.editorInvitesCollaborator(actors.charlie);
            h.currentActor = "charlie";

            const updates = {
                ...page.entry,
                content: updatedContent,
            };
            if (newTitle) updates.title = newTitle;

            const suggestedUpdate = await h.collaboratorSuggestsChange(
                page,
                updates
            );
            debugger;
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
            expect(updated!.entry.content).toMatch(/Page content here/);
            expect(updated!.entry.content).toMatch(
                /Collaborator suggested update/
            );
        });

        it("can adopt multiple suggestions that don't conflict", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;

            const book = await h.bootstrap();

            const content =
                `# doc title\n\nintroduction text\n\n` +
                `## section 1\n\nsection 1 content\n\n` +
                `## section 2\n\nsection 2 content`;
            //prettier-ignore
            const [
                    pageCreated, page, 
                    suggestedUpdate1, suggestion1
                ] = await setup(context, {
                    initialPageAttrs: {
                        ...testSuggestedPage,
                        content
                    },
                    updatedContent: content.replace(/1 content/, "1 updated content")
                });

            const { resourceId: pageId } = pageCreated;
            const { resourceId: suggestionId1 } = suggestedUpdate1;
            const {
                state: {
                    uuts: { collab: cindyCollab },
                },
            } = await h.editorInvitesCollaborator(actors.cindy);
            h.currentActor = "cindy";

            const suggestedUpdate2 = await h.collaboratorSuggestsChange(page, {
                ...page.entry,
                content: content.replace(/1 content/, "1 good content"),
            });
            const suggestion2 = await h.book.findBookEntry(
                suggestedUpdate2.resourceId
            );
            console.log("diff 2 ", suggestion2.entry.content);
            expect(
                suggestion2.ownerAuthority.uutName,
                "suggestion2 not attributed to cindy"
            ).toEqual(cindyCollab.name);

            h.currentActor = "camilla";
            const { tcx } = await h.acceptSuggestions(page, [
                suggestion1,
                suggestion2,
            ]);
            const updated = await h.book.findBookEntry(pageId);
            expect(updated).toBeTruthy();
            expect(updated!.entry.content).toEqual(
                content.replace(/1 content/, "1 updated good content")
            );

            // // v9e5fds - change originator receives the suggestion's minUtxo
            // let foundCindyOutput : TxOutput | undefined;
            // let foundCharlieOutput : TxOutput | undefined;
            // for (const output of tcx.outputs) {
            //     if (output.address === actors.cindy.address) {
            //         foundCindyOutput = output;
            //     }
            //     if (output.address === actors.charlie.address) {
            //         foundCharlieOutput = output;
            //     }
            // }
            // expect(
            //     foundCindyOutput?.value.eq(
            //         new Value(suggestion2.utxo.value.lovelace)
            //     ), "minUtxo value not returned to suggester"
            // ).toBeTruthy();
            // expect(
            //     foundCharlieOutput?.value.eq(
            //         new Value(suggestion1.utxo.value.lovelace)
            //     ), "minUtxo value not returned to suggester"
            // ).toBeTruthy();

            // c4km5ol - suggestion UUTs are burned
            await expect(h.book.findBookEntry(suggestionId1)).rejects.toThrow(
                /not found/
            );
            await expect(
                h.book.findBookEntry(suggestedUpdate2.resourceId)
            ).rejects.toThrow(/not found/);
        });
        it("all accepted suggestions have their eid-* UUT burned", (context: localTC) => {
            console.log("tested at c4km5ol");
        });

        it.todo(
            "TODO: when accepted, the change originator receives the suggestion's minUtxo",
            (context: localTC) => {
                console.log(
                    "tested at v9e5fds, but disabled due to implementation difficulties"
                );
            }
        );

        it("can adopt conflicting sugestions with a provided resolution", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;

            // const strella =
            await h.bootstrap();

            const content =
                `# doc title\n\nintroduction text\n\n` +
                `## section 1\n\nsection 1 content\n\n` +
                `## section 2\n\nsection 2 content`;
            //prettier-ignore
            const [
                        pageCreated, page, 
                        suggestedUpdate1, suggestion1
                    ] = await setup(context, {
                        initialPageAttrs: {
                            ...testSuggestedPage,
                            content
                        },
                        updatedContent: content.replace(
                            /1 content/, "number-one updated content")
                    });

            const { resourceId: pageId } = pageCreated;
            const { resourceId: suggestionId1 } = suggestedUpdate1;

            const suggestedUpdate2 = await h.collaboratorSuggestsChange(page, {
                ...page.entry,
                content: content.replace(
                    /1 content/,
                    "first-bit conflicting info"
                ),
            });
            const suggestion2 = await h.book.findBookEntry(
                suggestedUpdate2.resourceId
            );
            console.log("diff 2 ", suggestion2.entry.content);

            h.currentActor = "camilla";
            debugger;
            await expect(
                h.acceptSuggestions(page, [suggestion1, suggestion2])
            ).rejects.toThrow(/apply cleanly/);

            const resolved = content.replace(
                /1 content/,
                "number-one updated with conflict resolved"
            );

            await h.acceptSuggestions(page, [suggestion1, suggestion2], {
                content: resolved,
            });
            const updated = await h.book.findBookEntry(pageId);
            expect(updated).toBeTruthy();
            expect(updated!.entry.content).toEqual(resolved);
        });

        it("editor can accept suggestions", async (context: localTC) => {
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
            const editorUut = (await h.book.findUserRoleInfo("collab"))!.uut;
            await h.acceptSuggestions(page, [suggestion]);

            const updated = await h.book.findBookEntry(pageId);
            expect(updated).toBeTruthy();
            expect(updated.entry.updatedBy).toEqual(editorUut.name);
            expect(updated!.entry.content).toMatch(/Page content here/);
            expect(updated!.entry.content).toMatch(
                /Collaborator suggested update/
            );
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
                ownerAuthority: { uutName: ownerTokenName },
            } = page;
            const { resourceId: suggestionId } = suggestedUpdate;

            await h.editorInvitesCollaborator(actors.ralph);
            h.currentActor = "ralph";
            const offChain = h.acceptSuggestions(page, [suggestion]);
            await expect(offChain).rejects.toThrow(
                /wallet doesn't have.*authority/
            );

            vi.spyOn(h.book, "userHasOwnership").mockReturnValue(true);
            const onChain = h.acceptSuggestions(page, [suggestion]);
            await expect(onChain).rejects.toThrow(
                new RegExp(`owner ${ownerTokenName} missing`)
            );

            // the editor's token that's required when the doc owner isn't found
            await expect(onChain).rejects.toThrow(/missing.*dgTkn capoGov/);
        });
        it("when NOT accepting changes, the mint-delegate's AcceptingPageChanges activity fails", async (context: localTC) => {
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
                ownerAuthority: { uutName: ownerTokenName },
            } = page;
            const { resourceId: suggestionId } = suggestedUpdate;

            // back to the owner of the document created in setup():
            h.currentActor = "camilla";

            const orig = h.book.mkTxnUpdatingEntry.bind(h.book);
            const spy = vi
                .spyOn(h.book, "mkTxnUpdatingEntry")
                .mockImplementation((arg, activity) => {
                    return orig(arg, h.book.activityRetiringPage());
                });
            const onChain = h.acceptSuggestions(page, [suggestion]);
            await expect(onChain).rejects.toThrow(/wrong page-level activity/);
        });
    });

    describe("rejecting changes", () => {
        it.todo("TODO: a random collaborator can't reject a suggested change");
        it.todo("TODO: editor can reject a suggested change");
        it.todo("TODO: page owner can reject a suggested change");
        it.todo("TODO: when a change is rejected, its eid-* UUT is burned.");
        it.todo(
            "TODO: when NOT rejecting changes, the mint-delegate's RejectingPageChanges activity fails"
        );
    });
});
