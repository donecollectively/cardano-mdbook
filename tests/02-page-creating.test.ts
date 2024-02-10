import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
} from "vitest";

import {
    ADA,
    type StellarTestContext,
    addTestContext,
} from "@donecollectively/stellar-contracts";
import {
    CMDBCapoTestHelper,
} from "./CMDBCapoTestHelper.js";
import {
    BookEntryCreationAttrs,
} from "../src/contracts/CMDBCapo.js";
import { testPageEntry, testSuggestedPage } from "./testContent.js";

type localTC = StellarTestContext<CMDBCapoTestHelper>;

const it = itWithContext<localTC>;
const fit = it.only;
const xit = it.skip; //!!! todo: update this when vitest can have skip<HeliosTestingContext>
//!!! until then, we need to use if(0) it(...) : (
// ... or something we make up that's nicer

const describe = descrWithContext<localTC>;

describe("CMDB roles & activities -> ", async () => {
    beforeEach<localTC>(async (context) => {
        // await new Promise(res => setTimeout(res, 10));
        await addTestContext(context, CMDBCapoTestHelper);
    });
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

            const onChainEntry = (await book.findBookEntry(resourceId))!;

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
        it("can't have updatedBy during creation", async (context: localTC) => {
            // prettier-ignore
            const {h, h:{network, actors, delay, state} } = context;

            // const strella =
            await h.bootstrap();

            await h.editorInvitesCollaborator(actors.editor);
            const { content: expectedContent } = testPageEntry;
            await expect(
                h.collaboratorCreatesPage({
                    ...testPageEntry,
                    //@ts-expect-error
                    updatedBy: "bad",
                })
            ).rejects.toThrow("updatedBy must be empty");
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
            await expect(pageCreation).rejects.toThrow(/trace: 8rf2o3j4/);
            await expect(pageCreation).rejects.toThrow(
                /missing.*dgTkn capoGov-/
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
});
