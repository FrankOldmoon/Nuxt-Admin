ALTER TABLE "templates" ALTER COLUMN "doc_file" TYPE jsonb USING CASE
  WHEN "doc_file" IS NULL THEN '[]'::jsonb
  WHEN "doc_file" = '' THEN '[]'::jsonb
  ELSE jsonb_build_array("doc_file")
END;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "doc_file" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "doc_file" SET NOT NULL;