"use strict";

import powerbi from "powerbi-visuals-api";
import IAuthenticationService = powerbi.extensibility.IAuthenticationService;

export interface ContentRecord {
    id: string;
    visualId: string;
    recordKey: string;
    contentHtml: string;
    createdAt: string;
    updatedAt: string;
}

const FABRIC_API = "https://api.fabric.microsoft.com/v1";

export class FabricService {
    private workspaceId: string;
    private functionSetId: string;
    private authService: IAuthenticationService;

    constructor(workspaceId: string, functionSetId: string, authService: IAuthenticationService) {
        this.workspaceId    = workspaceId;
        this.functionSetId  = functionSetId;
        this.authService    = authService;
    }

    // Wraps IPromise<string> (Power BI's own promise type) into a native Promise
    private getToken(): Promise<string> {
        return new Promise<string>(function(resolve, reject) {
            (this as any).authService.getAADToken().then(
                function(token: string) { resolve(token); },
                function(err: any)      { reject(err); }
            );
        }.bind(this));
    }

    private invoke(fnName: string, params: Record<string, string>): Promise<string> {
        const self = this;
        const url  = FABRIC_API
            + "/workspaces/"         + self.workspaceId
            + "/userDataFunctions/"  + self.functionSetId
            + "/functions/"          + fnName
            + "/invoke";

        return self.getToken().then(function(token: string) {
            return fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type":  "application/json"
                },
                body: JSON.stringify({ inputData: params })
            });
        }).then(function(res: Response) {
            if (!res.ok) {
                return res.text().then(function(text: string) {
                    throw new Error("Fabric API " + res.status + ": " + text);
                });
            }
            return res.json();
        }).then(function(data: any) {
            return data.output as string;
        });
    }

    get(visualId: string, recordKey: string): Promise<ContentRecord | null> {
        return this.invoke("get_content", {
            visualId:  visualId,
            recordKey: recordKey
        }).then(function(output: string) {
            if (!output || output === "null") return null;
            return JSON.parse(output) as ContentRecord;
        });
    }

    save(visualId: string, recordKey: string, contentHtml: string): Promise<ContentRecord> {
        return this.invoke("save_content", {
            visualId:    visualId,
            recordKey:   recordKey,
            contentHtml: contentHtml
        }).then(function(output: string) {
            return JSON.parse(output) as ContentRecord;
        });
    }

    delete(contentId: string): Promise<void> {
        return this.invoke("delete_content", {
            contentId: contentId
        }).then(function() { return; });
    }
}
