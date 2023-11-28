import { BasicMintDelegate, HeliosModuleSrc, mkHeliosModule } from "@donecollectively/stellar-contracts";

//@ts-expect-error because TS doesn't understand helios
import CMDBSpecialMintDelegate from "./specializedMintDelegate.hl";

//@ts-expect-error because TS doesn't understand helios
import CMDBSpecialCapo from "./specializedCMDBCapo.hl";

export class CMDBMintDelegate extends BasicMintDelegate {

    _m : HeliosModuleSrc 
    get specializedMintDelegate(): HeliosModuleSrc {
        if (this._m) return this._m

        return this._m = mkHeliosModule(CMDBSpecialMintDelegate, "specializedMintDelegate");
    }

    _c : HeliosModuleSrc
    get specializedCapo(): HeliosModuleSrc {
        if (this._c) return this._c;

        return this._c = mkHeliosModule(CMDBSpecialCapo, "specializedCapo")
    }

}