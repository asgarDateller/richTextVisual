"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.Card;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class FabricConfigCard extends FormattingSettingsCard {
    workspaceId = new formattingSettings.TextInput({
        name: "workspaceId",
        displayName: "Workspace ID",
        value: "",
        placeholder: "Paste your Fabric Workspace ID"
    });

    functionSetId = new formattingSettings.TextInput({
        name: "functionSetId",
        displayName: "Function Set ID",
        value: "",
        placeholder: "Paste your User Data Functions item ID"
    });

    visualId = new formattingSettings.TextInput({
        name: "visualId",
        displayName: "Visual ID",
        value: "",
        placeholder: "Auto-generated on first load"
    });

    name: string = "fabricConfig";
    displayName: string = "Fabric Configuration";
    slices: Array<FormattingSettingsSlice> = [this.workspaceId, this.functionSetId, this.visualId];
}

class ViewConfigCard extends FormattingSettingsCard {
    readOnly = new formattingSettings.ToggleSwitch({
        name: "readOnly",
        displayName: "Read Only",
        value: false
    });

    name: string = "viewConfig";
    displayName: string = "View";
    slices: Array<FormattingSettingsSlice> = [this.readOnly];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    fabricConfig = new FabricConfigCard();
    viewConfig = new ViewConfigCard();
    cards = [this.fabricConfig, this.viewConfig];
}
