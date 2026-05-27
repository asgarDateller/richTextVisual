-- ────────────────────────────────────────────────────────────────────────────
-- Rich Text Visual – Microsoft Fabric SQL Database schema
-- Run this once against your Fabric SQL database before deploying the API.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE dbo.RichTextContent (
    id           UNIQUEIDENTIFIER  NOT NULL  DEFAULT NEWID()         PRIMARY KEY,
    visual_id    NVARCHAR(100)     NOT NULL,
    record_key   NVARCHAR(500)     NOT NULL  DEFAULT 'default',
    content_html NVARCHAR(MAX)     NOT NULL  DEFAULT '',
    created_by   NVARCHAR(200)     NULL,
    created_at   DATETIME2(0)      NOT NULL  DEFAULT GETUTCDATE(),
    updated_at   DATETIME2(0)      NOT NULL  DEFAULT GETUTCDATE()
);
GO

-- Fast lookup by (visual_id, record_key) – the primary query pattern.
CREATE INDEX IX_RichTextContent_Lookup
    ON dbo.RichTextContent (visual_id, record_key);
GO

-- ── Optional: update trigger to keep updated_at current ──────────────────────
CREATE TRIGGER dbo.trg_RichTextContent_UpdatedAt
ON  dbo.RichTextContent
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RichTextContent
       SET updated_at = GETUTCDATE()
      FROM dbo.RichTextContent t
      JOIN inserted i ON t.id = i.id;
END;
GO

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT * FROM dbo.RichTextContent;
