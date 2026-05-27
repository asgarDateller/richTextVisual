import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as mssql from "mssql";

// ── Config from environment ───────────────────────────────────────────────────

const API_KEY        = process.env.API_KEY        || "";
const DB_SERVER      = process.env.DB_SERVER      || "";
const DB_DATABASE    = process.env.DB_DATABASE    || "";
const DB_USER        = process.env.DB_USER        || "";
const DB_PASSWORD    = process.env.DB_PASSWORD    || "";
const USE_AZURE_AD   = process.env.DB_USE_AZURE_AD === "true";

// ── Connection pool (reused across warm invocations) ─────────────────────────

let pool: mssql.ConnectionPool | null = null;

async function getPool(): Promise<mssql.ConnectionPool> {
    if (pool && pool.connected) return pool;

    const config: mssql.config = {
        server: DB_SERVER,
        database: DB_DATABASE,
        options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true
        },
        connectionTimeout: 30000,
        requestTimeout: 30000
    };

    if (USE_AZURE_AD) {
        (config as any).authentication = {
            type: "azure-active-directory-default",
            options: {}
        };
    } else {
        config.user = DB_USER;
        config.password = DB_PASSWORD;
    }

    pool = await mssql.connect(config);
    return pool;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders(req: HttpRequest): Record<string, string> {
    const origin = req.headers["origin"] || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        "Vary": "Origin"
    };
}

function json(context: Context, req: HttpRequest, status: number, body: unknown): void {
    context.res = {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        body: body === null || body === undefined ? "" : JSON.stringify(body)
    };
}

// ── Handler ───────────────────────────────────────────────────────────────────

const contentFn: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {

    // CORS pre-flight
    if (req.method === "OPTIONS") {
        context.res = { status: 204, headers: corsHeaders(req), body: "" };
        return;
    }

    // Auth
    if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
        json(context, req, 401, { error: "Unauthorized" });
        return;
    }

    const id     = context.bindingData.id as string | undefined;
    const method = (req.method || "").toUpperCase();

    try {
        const db = await getPool();

        // ── GET /api/content?visualId=&recordKey= ───────────────────────────
        if (method === "GET" && !id) {
            const visualId  = req.query.visualId  || "";
            const recordKey = req.query.recordKey || "default";

            if (!visualId) {
                json(context, req, 400, { error: "visualId is required" });
                return;
            }

            const result = await db.request()
                .input("visualId",  mssql.NVarChar(100), visualId)
                .input("recordKey", mssql.NVarChar(500), recordKey)
                .query(`
                    SELECT
                        CAST(id AS NVARCHAR(36))         AS id,
                        visual_id                        AS visualId,
                        record_key                       AS recordKey,
                        content_html                     AS contentHtml,
                        CONVERT(NVARCHAR, created_at, 127) AS createdAt,
                        CONVERT(NVARCHAR, updated_at, 127) AS updatedAt
                    FROM RichTextContent
                    WHERE visual_id = @visualId AND record_key = @recordKey
                `);

            json(context, req, result.recordset.length ? 200 : 404,
                 result.recordset.length ? result.recordset[0] : null);

        // ── POST /api/content ───────────────────────────────────────────────
        } else if (method === "POST" && !id) {
            const body      = req.body || {};
            const visualId  = (body.visualId  as string) || "";
            const recordKey = (body.recordKey as string) || "default";
            const contentHtml = (body.contentHtml as string) || "";

            if (!visualId) {
                json(context, req, 400, { error: "visualId is required" });
                return;
            }

            const result = await db.request()
                .input("visualId",    mssql.NVarChar(100),      visualId)
                .input("recordKey",   mssql.NVarChar(500),      recordKey)
                .input("contentHtml", mssql.NVarChar(mssql.MAX), contentHtml)
                .query(`
                    INSERT INTO RichTextContent (visual_id, record_key, content_html)
                    OUTPUT
                        CAST(INSERTED.id AS NVARCHAR(36))              AS id,
                        INSERTED.visual_id                             AS visualId,
                        INSERTED.record_key                            AS recordKey,
                        INSERTED.content_html                          AS contentHtml,
                        CONVERT(NVARCHAR, INSERTED.created_at, 127)   AS createdAt,
                        CONVERT(NVARCHAR, INSERTED.updated_at, 127)   AS updatedAt
                    VALUES (@visualId, @recordKey, @contentHtml)
                `);

            json(context, req, 201, result.recordset[0]);

        // ── PUT /api/content/{id} ───────────────────────────────────────────
        } else if (method === "PUT" && id) {
            const body = req.body || {};
            const contentHtml = (body.contentHtml as string) || "";

            const result = await db.request()
                .input("id",          mssql.UniqueIdentifier,    id)
                .input("contentHtml", mssql.NVarChar(mssql.MAX), contentHtml)
                .query(`
                    UPDATE RichTextContent
                    SET content_html = @contentHtml,
                        updated_at   = GETUTCDATE()
                    OUTPUT
                        CAST(INSERTED.id AS NVARCHAR(36))              AS id,
                        INSERTED.visual_id                             AS visualId,
                        INSERTED.record_key                            AS recordKey,
                        INSERTED.content_html                          AS contentHtml,
                        CONVERT(NVARCHAR, INSERTED.created_at, 127)   AS createdAt,
                        CONVERT(NVARCHAR, INSERTED.updated_at, 127)   AS updatedAt
                    WHERE id = @id
                `);

            if (!result.recordset.length) {
                json(context, req, 404, { error: "Record not found" });
            } else {
                json(context, req, 200, result.recordset[0]);
            }

        // ── DELETE /api/content/{id} ────────────────────────────────────────
        } else if (method === "DELETE" && id) {
            const result = await db.request()
                .input("id", mssql.UniqueIdentifier, id)
                .query("DELETE FROM RichTextContent WHERE id = @id");

            if (result.rowsAffected[0] === 0) {
                json(context, req, 404, { error: "Record not found" });
            } else {
                json(context, req, 204, null);
            }

        } else {
            json(context, req, 405, { error: "Method not allowed" });
        }

    } catch (err) {
        context.log.error("Database error:", err);
        json(context, req, 500, { error: "Internal server error", detail: String(err) });
    }
};

export default contentFn;
