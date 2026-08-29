CREATE TABLE "dict_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_id" integer NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dict_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dict_items" ADD CONSTRAINT "dict_items_type_id_dict_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."dict_types"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "dict_items_type_id_idx" ON "dict_items" USING btree ("type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dict_types_code_idx" ON "dict_types" USING btree ("code");