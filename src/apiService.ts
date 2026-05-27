"use strict";

export interface ContentRecord {
    id: string;
    visualId: string;
    recordKey: string;
    contentHtml: string;
    createdAt: string;
    updatedAt: string;
}

export class ApiService {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.apiKey = apiKey;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (this.apiKey) {
            headers["x-api-key"] = this.apiKey;
        }
        return headers;
    }

    get(visualId: string, recordKey: string): Promise<ContentRecord | null> {
        const url = this.baseUrl
            + "/content?visualId=" + encodeURIComponent(visualId)
            + "&recordKey=" + encodeURIComponent(recordKey);
        return fetch(url, { headers: this.getHeaders() }).then(function(res) {
            if (res.status === 404) return null;
            if (!res.ok) throw new Error("API error " + res.status);
            return res.json() as Promise<ContentRecord>;
        });
    }

    create(data: { visualId: string; recordKey: string; contentHtml: string }): Promise<ContentRecord> {
        return fetch(this.baseUrl + "/content", {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        }).then(function(res) {
            if (!res.ok) throw new Error("API error " + res.status);
            return res.json() as Promise<ContentRecord>;
        });
    }

    update(id: string, contentHtml: string): Promise<ContentRecord> {
        return fetch(this.baseUrl + "/content/" + id, {
            method: "PUT",
            headers: this.getHeaders(),
            body: JSON.stringify({ contentHtml: contentHtml })
        }).then(function(res) {
            if (!res.ok) throw new Error("API error " + res.status);
            return res.json() as Promise<ContentRecord>;
        });
    }

    delete(id: string): Promise<void> {
        return fetch(this.baseUrl + "/content/" + id, {
            method: "DELETE",
            headers: this.getHeaders()
        }).then(function(res) {
            if (!res.ok) throw new Error("API error " + res.status);
        });
    }
}
