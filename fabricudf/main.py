"""
Rich Text Visual – Fabric User Data Functions
==============================================
Paste this code into a new "User Data Functions" item in your Fabric workspace.

Setup steps in Fabric:
  1. Create a new item → User Data Functions → name it e.g. "RichTextVisualFunctions"
  2. Click "Manage connections" → Add data connection → select your SQL database → Connect
  3. Copy the auto-generated connection alias (e.g. "RichTextDb") and paste it below
  4. Replace REPLACE_WITH_YOUR_ALIAS in every @udf.connection decorator
  5. Click Publish
"""

import fabric.functions as fn
import json
import logging

udf = fn.UserDataFunctions()

# ── Replace this alias with the one shown in Manage Connections ─────────────
DB_ALIAS = "REPLACE_WITH_YOUR_ALIAS"


# ── GET ──────────────────────────────────────────────────────────────────────
@udf.connection(argName="sqlDb", alias=DB_ALIAS)
@udf.function()
def get_content(sqlDb: fn.FabricSqlConnection, visualId: str, recordKey: str) -> str:
    """
    Returns the saved HTML content for a given visual + record key.
    Returns the string "null" if no record exists yet.
    """
    conn = sqlDb.connect()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                CAST(id AS NVARCHAR(36)) AS id,
                visual_id,
                record_key,
                content_html,
                CONVERT(NVARCHAR, created_at, 127),
                CONVERT(NVARCHAR, updated_at, 127)
            FROM dbo.RichTextContent
            WHERE visual_id = ? AND record_key = ?
        """, (visualId, recordKey))
        row = cursor.fetchone()
        if not row:
            return "null"
        return json.dumps({
            "id":          row[0],
            "visualId":    row[1],
            "recordKey":   row[2],
            "contentHtml": row[3],
            "createdAt":   row[4],
            "updatedAt":   row[5]
        })
    finally:
        cursor.close()
        conn.close()


# ── SAVE (upsert: create or update) ─────────────────────────────────────────
@udf.connection(argName="sqlDb", alias=DB_ALIAS)
@udf.function()
def save_content(sqlDb: fn.FabricSqlConnection,
                 visualId: str,
                 recordKey: str,
                 contentHtml: str) -> str:
    """
    Creates or updates the HTML content for a given visual + record key.
    Returns the saved record as a JSON string.
    """
    conn = sqlDb.connect()
    cursor = conn.cursor()
    try:
        # Check if a record already exists
        cursor.execute(
            "SELECT CAST(id AS NVARCHAR(36)) FROM dbo.RichTextContent WHERE visual_id = ? AND record_key = ?",
            (visualId, recordKey)
        )
        existing = cursor.fetchone()

        if existing:
            # UPDATE
            cursor.execute("""
                UPDATE dbo.RichTextContent
                SET content_html = ?, updated_at = GETUTCDATE()
                WHERE visual_id = ? AND record_key = ?
            """, (contentHtml, visualId, recordKey))
        else:
            # INSERT
            cursor.execute("""
                INSERT INTO dbo.RichTextContent (visual_id, record_key, content_html)
                VALUES (?, ?, ?)
            """, (visualId, recordKey, contentHtml))

        conn.commit()

        # Fetch and return the saved record
        cursor.execute("""
            SELECT
                CAST(id AS NVARCHAR(36)),
                visual_id,
                record_key,
                content_html,
                CONVERT(NVARCHAR, created_at, 127),
                CONVERT(NVARCHAR, updated_at, 127)
            FROM dbo.RichTextContent
            WHERE visual_id = ? AND record_key = ?
        """, (visualId, recordKey))
        row = cursor.fetchone()
        return json.dumps({
            "id":          row[0],
            "visualId":    row[1],
            "recordKey":   row[2],
            "contentHtml": row[3],
            "createdAt":   row[4],
            "updatedAt":   row[5]
        })
    except Exception as e:
        conn.rollback()
        logging.error(f"save_content error: {e}")
        raise fn.UserThrownError(f"Failed to save content: {str(e)}")
    finally:
        cursor.close()
        conn.close()


# ── DELETE ───────────────────────────────────────────────────────────────────
@udf.connection(argName="sqlDb", alias=DB_ALIAS)
@udf.function()
def delete_content(sqlDb: fn.FabricSqlConnection, contentId: str) -> str:
    """
    Deletes a record by its UUID.
    Returns "deleted" on success or "not_found" if the ID doesn't exist.
    """
    conn = sqlDb.connect()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM dbo.RichTextContent WHERE id = ?",
            (contentId,)
        )
        affected = cursor.rowcount
        conn.commit()
        return "deleted" if affected > 0 else "not_found"
    except Exception as e:
        conn.rollback()
        logging.error(f"delete_content error: {e}")
        raise fn.UserThrownError(f"Failed to delete content: {str(e)}")
    finally:
        cursor.close()
        conn.close()
