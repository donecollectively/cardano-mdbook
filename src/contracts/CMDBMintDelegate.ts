import { Activity, BasicMintDelegate, HeliosModuleSrc, SeedAttrs, UutName, isActivity, mkHeliosModule } from "@donecollectively/stellar-contracts";

//@ts-expect-error because TS doesn't understand helios
import CMDBSpecialMintDelegate from "./specializedMintDelegate.hl";

//@ts-expect-error because TS doesn't understand helios
import CMDBSpecialCapo from "./specializedCMDBCapo.hl";
import { CMDBController } from "./CMDBController.js";

export class CMDBMintDelegate extends BasicMintDelegate {
    @Activity.redeemer
    activityMintingCollaboratorToken(seedAttrs: SeedAttrs) : isActivity {
        const MCT = this.mustGetActivity("MintingCollaboratorToken");
        const {seedTxn, seedIndex} = seedAttrs
        const t = new MCT(seedTxn, seedIndex);
        return { redeemer: t._toUplcData() };
    }
    
    @Activity.redeemer
    activityCreatingBookPage(
        seedAttrs: SeedAttrs,
    ) : isActivity {
        const Creating = this.mustGetActivity("CreatingBookPage");
        const {seedTxn, seedIndex} = seedAttrs
        const t = new Creating(
            seedTxn,
            seedIndex,
        );
        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    activitySuggestingPageChanges(
        seedAttrs: SeedAttrs,
    ) : isActivity {
        // creates a suggestion utxo
        const SuggestingChange = this.mustGetActivity("SuggestingPageChange");

        const {seedTxn, seedIndex} = seedAttrs
        const t = new SuggestingChange(
            seedTxn,
            seedIndex,
        );
        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    activityAcceptingSuggestions(pageEid: string) : isActivity {
        // accepting suggestions (spends & updates a Page utxo)
        const Accepting = this.mustGetActivity("AcceptingSuggestions");

        const t = new Accepting(pageEid);
        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    burnSuggestionsBeingAccepted(pageEid: string) : isActivity {
        // burns a suggestion utxo
        const Accepting = this.mustGetActivity("burnSuggestionsBeingAccepted");
        const t = new Accepting(pageEid);
        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    burnSuggestionsBeingRejected(pageEid: string) : isActivity {
        // burns a suggestion utxo
        const Rejecting = this.mustGetActivity("burnSuggestionsBeingRejected");
        const t = new Rejecting(pageEid);
        return { redeemer: t._toUplcData() };
    }

    _m : HeliosModuleSrc 
    get specializedMintDelegate(): HeliosModuleSrc {
        if (this._m) return this._m

        return this._m = mkHeliosModule(CMDBSpecialMintDelegate, "specializedMintDelegate");
    }

    _c : HeliosModuleSrc
    get specializedCapo(): HeliosModuleSrc {
        throw new Error("unused?");
        if (this._c) return this._c;

        return this._c = mkHeliosModule(CMDBSpecialCapo, "specializedCapo")
    }
}


