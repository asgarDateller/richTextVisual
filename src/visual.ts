"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";
import Quill from "quill";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { VisualFormattingSettingsModel } from "./settings";
import { FabricService, ContentRecord } from "./fabricService";

type VisualState = "loading" | "view" | "edit" | "empty" | "error" | "unconfigured";

export class Visual implements IVisual {
    private host: IVisualHost;
    private container: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    // UI elements
    private statusEl: HTMLElement;
    private actionBar: HTMLElement;
    private editBtn: HTMLButtonElement;
    private saveBtn: HTMLButtonElement;
    private cancelBtn: HTMLButtonElement;
    private deleteBtn: HTMLButtonElement;
    private viewEl: HTMLElement;
    private editWrapper: HTMLElement;
    private quill: Quill;

    // State
    private state: VisualState = "loading";
    private currentRecord: ContentRecord | null = null;
    private currentRecordKey: string = "";
    private fabricService: FabricService | null = null;
    private isReadOnly: boolean = false;
    private deleteConfirmActive: boolean = false;
    private deleteConfirmTimer: any = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.formattingSettingsService = new FormattingSettingsService();
        this.container = options.element;
        this.container.className = "rtv-root";
        this.buildUI();
    }

    private buildUI(): void {
        this.statusEl = document.createElement("div");
        this.statusEl.className = "rtv-status";
        this.container.appendChild(this.statusEl);

        this.actionBar = document.createElement("div");
        this.actionBar.className = "rtv-action-bar";

        this.editBtn   = this.mkBtn("&#9998; Edit",    "rtv-btn rtv-btn-edit",   function(self: Visual) { self.enterEdit(); });
        this.saveBtn   = this.mkBtn("&#10003; Save",   "rtv-btn rtv-btn-save",   function(self: Visual) { self.save(); });
        this.cancelBtn = this.mkBtn("&#10005; Cancel", "rtv-btn rtv-btn-cancel", function(self: Visual) { self.cancelEdit(); });
        this.deleteBtn = this.mkBtn("&#128465; Delete","rtv-btn rtv-btn-delete", function(self: Visual) { self.handleDelete(); });

        this.actionBar.appendChild(this.editBtn);
        this.actionBar.appendChild(this.saveBtn);
        this.actionBar.appendChild(this.cancelBtn);
        this.actionBar.appendChild(this.deleteBtn);
        this.container.appendChild(this.actionBar);

        // Read-only view area
        this.viewEl = document.createElement("div");
        this.viewEl.className = "rtv-view ql-snow";
        this.container.appendChild(this.viewEl);

        // Quill edit area
        this.editWrapper = document.createElement("div");
        this.editWrapper.className = "rtv-edit-wrapper";
        const quillDiv = document.createElement("div");
        quillDiv.className = "rtv-editor";
        this.editWrapper.appendChild(quillDiv);
        this.container.appendChild(this.editWrapper);

        this.quill = new Quill(quillDiv, {
            theme: "snow",
            placeholder: "Start writing...",
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline"],
                    [{ color: [] }, { background: [] }],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link"],
                    ["clean"]
                ]
            }
        });
    }

    private mkBtn(html: string, className: string, action: (self: Visual) => void): HTMLButtonElement {
        const self = this;
        const b = document.createElement("button");
        b.innerHTML = html;
        b.className = className;
        b.addEventListener("click", function() { action(self); });
        return b;
    }

    private applyState(): void {
        const s = this.state;
        const isEdit         = s === "edit";
        const isView         = s === "view";
        const isEmpty        = s === "empty";
        const isLoading      = s === "loading";
        const isError        = s === "error";
        const isUnconfigured = s === "unconfigured";

        // Action bar buttons
        this.editBtn.style.display   = (!this.isReadOnly && (isView || isEmpty)) ? "" : "none";
        this.saveBtn.style.display   = isEdit ? "" : "none";
        this.cancelBtn.style.display = isEdit ? "" : "none";
        this.deleteBtn.style.display = (isEdit && this.currentRecord !== null) ? "" : "none";

        if (!isEdit) {
            this.clearDeleteConfirm();
        }

        // Content panes
        this.viewEl.style.display      = (isView || isEmpty) ? "" : "none";
        this.editWrapper.style.display = isEdit ? "" : "none";

        // Status bar
        if (isLoading) {
            this.statusEl.textContent = "Loading…";
            this.statusEl.className = "rtv-status rtv-status-loading";
            this.statusEl.style.display = "";
            this.viewEl.style.display = "none";
        } else if (isError) {
            this.statusEl.textContent = "⚠ Could not reach Fabric. Check Format › Fabric Configuration.";
            this.statusEl.className = "rtv-status rtv-status-error";
            this.statusEl.style.display = "";
        } else if (isUnconfigured) {
            this.statusEl.textContent = "→ Open the Format pane and set your Workspace ID and Function Set ID to get started.";
            this.statusEl.className = "rtv-status rtv-status-info";
            this.statusEl.style.display = "";
        } else {
            this.statusEl.style.display = "none";
        }

        if (isEmpty) {
            this.viewEl.innerHTML = "<p class=\"rtv-placeholder\">No content yet. Click ✎ Edit to add some.</p>";
        }
    }

    // ── Edit mode ────────────────────────────────────────────────────────────

    private enterEdit(): void {
        this.quill.root.innerHTML = this.currentRecord ? this.currentRecord.contentHtml : "";
        this.state = "edit";
        this.applyState();
        this.quill.focus();
    }

    private cancelEdit(): void {
        this.clearDeleteConfirm();
        this.state = this.currentRecord ? "view" : "empty";
        if (this.currentRecord) {
            this.viewEl.innerHTML = this.currentRecord.contentHtml;
        }
        this.applyState();
    }

    // ── Delete (two-tap confirmation, no confirm()) ───────────────────────────

    private handleDelete(): void {
        if (!this.deleteConfirmActive) {
            this.deleteConfirmActive = true;
            this.deleteBtn.innerHTML = "⚠ Confirm Delete?";
            this.deleteBtn.classList.add("rtv-btn-delete-confirm");
            const self = this;
            this.deleteConfirmTimer = setTimeout(function() { self.clearDeleteConfirm(); }, 4000);
        } else {
            this.doDelete();
        }
    }

    private clearDeleteConfirm(): void {
        if (this.deleteConfirmTimer !== null) {
            clearTimeout(this.deleteConfirmTimer);
            this.deleteConfirmTimer = null;
        }
        this.deleteConfirmActive = false;
        this.deleteBtn.innerHTML = "&#128465; Delete";
        this.deleteBtn.classList.remove("rtv-btn-delete-confirm");
    }

    private doDelete(): void {
        if (!this.fabricService || !this.currentRecord) return;
        const self = this;
        this.deleteBtn.disabled = true;
        this.fabricService.delete(this.currentRecord.id).then(function() {
            self.currentRecord = null;
            self.viewEl.innerHTML = "";
            self.state = "empty";
            self.applyState();
        }).catch(function() {
            self.state = "error";
            self.applyState();
        }).then(function() {
            self.deleteBtn.disabled = false;
            self.clearDeleteConfirm();
        });
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    private save(): void {
        if (!this.fabricService) return;

        const html = this.quill.root.innerHTML;
        const isEmpty = html === "<p><br></p>" || html.trim() === "";
        const visualId = this.formattingSettings.fabricConfig.visualId.value || "";

        const self = this;
        this.saveBtn.disabled = true;
        this.saveBtn.textContent = "Saving…";

        const op: Promise<ContentRecord> = this.fabricService.save(
            visualId, this.currentRecordKey, html
        );

        op.then(function(record: ContentRecord) {
            self.currentRecord = record;
            self.viewEl.innerHTML = record.contentHtml;
            self.state = isEmpty ? "empty" : "view";
            self.applyState();
        }).catch(function() {
            self.state = "error";
            self.applyState();
        }).then(function() {
            self.saveBtn.disabled = false;
            self.saveBtn.innerHTML = "&#10003; Save";
        });
    }

    // ── Power BI lifecycle ────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, options.dataViews
        );

        const workspaceId   = this.formattingSettings.fabricConfig.workspaceId.value   || "";
        const functionSetId = this.formattingSettings.fabricConfig.functionSetId.value || "";
        this.isReadOnly = this.formattingSettings.viewConfig.readOnly.value || false;

        if (!workspaceId || !functionSetId) {
            this.state = "unconfigured";
            this.applyState();
            return;
        }

        // Auto-generate and persist visual ID on first load
        let visualId = this.formattingSettings.fabricConfig.visualId.value || "";
        if (!visualId) {
            visualId = this.generateId();
            this.host.persistProperties({
                merge: [{
                    objectName: "fabricConfig",
                    selector: null,
                    properties: { visualId: { value: visualId } }
                }]
            });
            return; // next update() will carry the persisted ID
        }

        this.fabricService = new FabricService(
            workspaceId,
            functionSetId,
            this.host.authenticationService
        );

        // Don't clobber an in-progress edit
        if (this.state === "edit") return;

        const newKey = this.getRecordKey(options);
        if (newKey !== this.currentRecordKey || this.state === "loading") {
            this.currentRecordKey = newKey;
            this.loadContent(visualId, newKey);
        }
    }

    private loadContent(visualId: string, recordKey: string): void {
        if (!this.fabricService) return;
        const self = this;
        this.state = "loading";
        this.applyState();

        this.fabricService.get(visualId, recordKey).then(function(record: ContentRecord | null) {
            self.currentRecord = record;
            if (record) {
                self.viewEl.innerHTML = record.contentHtml;
                self.state = "view";
            } else {
                self.state = "empty";
            }
            self.applyState();
        }).catch(function() {
            self.state = "error";
            self.applyState();
        });
    }

    private getRecordKey(options: VisualUpdateOptions): string {
        try {
            const dv = options.dataViews;
            if (dv && dv.length > 0) {
                const cat = dv[0].categorical;
                if (cat && cat.categories && cat.categories.length > 0) {
                    const vals = cat.categories[0].values;
                    if (vals && vals.length > 0 && vals[0] !== null && vals[0] !== undefined) {
                        return String(vals[0]);
                    }
                }
            }
        } catch (e) { /* fall through */ }
        return "default";
    }

    private generateId(): string {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
