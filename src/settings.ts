"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.Card;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class ApiConfigCard extends FormattingSettingsCard {
    apiUrl = new formattingSettings.TextInput({
        name: "apiUrl",
        displayName: "API Base URL",
        value: "",
        placeholder: "https://your-function.azurewebsites.net/api"
    });

    apiKey = new formattingSettings.TextInput({
        name: "apiKey",
        displayName: "API Key",
        value: "",
        placeholder: "Your API key (leave blank if none)"
    });

    visualId = new formattingSettings.TextInput({
        name: "visualId",
        displayName: "Visual ID",
        value: "",
        placeholder: "Auto-generated on first load"
    });

    name: string = "apiConfig";
    displayName: string = "API Configuration";
    slices: Array<FormattingSettingsSlice> = [this.apiUrl, this.apiKey, this.visualId];
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
    apiConfig = new ApiConfigCard();
    viewConfig = new ViewConfigCard();
    cards = [this.apiConfig, this.viewConfig];
}
