
import {
    ADA,
    DefaultCapoTestHelper,    
} from "@donecollectively/stellar-contracts";
import { CMDBCapo } from "../src/contracts/CMDBCapo.js";

export class CMDBCapoTestHelper extends DefaultCapoTestHelper.forCapoClass(CMDBCapo) {
    setupActors() {
        this.addActor("editor", 1100n * ADA);
        this.addActor("charlie", 13n * ADA);
        this.addActor("camilla", 120n * ADA);
        this.currentActor = "editor";
    }   
 
    async editorInvitesCollaborator() {
        
    }

    async collaboratorCreatesPage() {
        

    }

    async collaboratorSuggestsPage() {
    }

    async collaboratorSuggestsChange() {
    }

    async editorAcceptsSuggestion() {
    }

    async ownerAcceptsSuggestion() {
    }


}
 
