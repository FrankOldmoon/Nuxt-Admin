-- Templates: the `markdown` text column was renamed to `content` (jsonb) to
-- store Tiptap JSON documents for the rich text editor / renderer.
-- 1. Add the new jsonb column.
ALTER TABLE "templates" ADD COLUMN "content" jsonb;
-- 2. Migrate any existing markdown text into a simple JSON paragraph (the
--    old markdown formatting is lost, but the text content is preserved).
UPDATE "templates"
SET "content" = jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', COALESCE("markdown", ''))
          )
        )
      )
    )
WHERE "content" IS NULL AND "markdown" IS NOT NULL AND "markdown" <> '';
-- 3. Drop the old column.
ALTER TABLE "templates" DROP COLUMN IF EXISTS "markdown";
