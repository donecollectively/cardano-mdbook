
//@ts-nocheck

//! this file implements a workaround for a problem
//  ... where a second imported .hl file in a single .ts file
//  ... causes the dts rollup plugin to not find the second .hl file
import {
    mkHeliosModule, 
    type HeliosModuleSrc 
} from "@donecollectively/stellar-contracts";

//@ts-expect-error because TS doesn't understand helios
import modelController from "./CMDBController.hl";

export const CMDBController: HeliosModuleSrc = mkHeliosModule(
    modelController, 
    "src/contracts/CMDBController.hl"
);
